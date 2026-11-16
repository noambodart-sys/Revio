import type { Tx } from "../db";
import { BUSINESS_TIMEZONE } from "@/config/product";
import { getRules } from "./rules";
import { bestThreshold, inSegment, loadCustomerRows, reachable } from "./segments";

const DAYS = ["", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

/** Les chiffres du jour, en heure locale du commerce, comparés au même jour la semaine dernière. */
export async function todayStats(tx: Tx, merchantId: string) {
  const [row] = await tx.$queryRaw<{ visits: bigint; revenue: bigint | null; points: bigint | null; visits_lw: bigint; new_customers: bigint }[]>`
    WITH t AS (SELECT (now() AT TIME ZONE ${BUSINESS_TIMEZONE})::date AS d)
    SELECT
      COUNT(*) FILTER (WHERE pt.type = 'EARN' AND (pt.occurred_at AT TIME ZONE 'UTC' AT TIME ZONE ${BUSINESS_TIMEZONE})::date = t.d) AS visits,
      SUM(pt.purchase_amount_cents) FILTER (WHERE pt.type = 'EARN' AND (pt.occurred_at AT TIME ZONE 'UTC' AT TIME ZONE ${BUSINESS_TIMEZONE})::date = t.d) AS revenue,
      SUM(pt.points) FILTER (WHERE pt.points > 0 AND (pt.occurred_at AT TIME ZONE 'UTC' AT TIME ZONE ${BUSINESS_TIMEZONE})::date = t.d) AS points,
      COUNT(*) FILTER (WHERE pt.type = 'EARN' AND (pt.occurred_at AT TIME ZONE 'UTC' AT TIME ZONE ${BUSINESS_TIMEZONE})::date = t.d - 7) AS visits_lw,
      (SELECT COUNT(*) FROM customers c WHERE c.merchant_id = ${merchantId}::uuid AND c.phone_verified_at IS NOT NULL
         AND (c.enrolled_at AT TIME ZONE 'UTC' AT TIME ZONE ${BUSINESS_TIMEZONE})::date = t.d) AS new_customers
    FROM t LEFT JOIN point_transactions pt ON pt.merchant_id = ${merchantId}::uuid
    GROUP BY t.d`;
  return {
    visits: Number(row?.visits ?? 0),
    visitsLastWeek: Number(row?.visits_lw ?? 0),
    revenueCents: Number(row?.revenue ?? 0),
    points: Number(row?.points ?? 0),
    newCustomers: Number(row?.new_customers ?? 0),
  };
}

export interface Suggestion {
  key: string;
  icon: string;
  title: string;
  text: string;
  templateKey: string;
  segmentKey: string;
  recipients: number;
}

/**
 * Suggestions d'actions, par règles simples (sans IA pour l'instant) :
 * relancer les absents, prévenir ceux proches d'une récompense, fêter les anniversaires,
 * animer le jour le plus calme.
 */
export async function suggestions(tx: Tx, merchantId: string, now = new Date()): Promise<Suggestion[]> {
  const rules = await getRules(tx, merchantId);
  const rows = await loadCustomerRows(tx, merchantId, now);
  const ctx = { now, bestThreshold: bestThreshold(rows) };
  const count = (k: Parameters<typeof inSegment>[0]) => rows.filter((r) => inSegment(k, r, ctx) && reachable(r, rules.smsMaxPerMonth)).length;
  const out: Suggestion[] = [];

  const lapsed = count("lapsed");
  if (lapsed >= 1) {
    out.push({
      key: "lapsed", icon: "💌", templateKey: "missyou", segmentKey: "lapsed", recipients: lapsed,
      title: `${lapsed} client${lapsed > 1 ? "s" : ""} à faire revenir`,
      text: `${lapsed > 1 ? "Ils ne sont" : "Il n'est"} pas venu${lapsed > 1 ? "s" : ""} depuis plus d'un mois. Un petit mot avec un cadeau ?`,
    });
  }
  const near = count("nearReward");
  if (near >= 1) {
    out.push({
      key: "near", icon: "🎁", templateKey: "almost", segmentKey: "nearReward", recipients: near,
      title: `${near} client${near > 1 ? "s" : ""} presque à une récompense`,
      text: "Prévenez-les : c'est souvent ce qui les fait revenir cette semaine.",
    });
  }
  const anniv = count("anniversary");
  if (anniv >= 1) {
    out.push({
      key: "anniv", icon: "🎂", templateKey: "anniversary", segmentKey: "anniversary", recipients: anniv,
      title: `${anniv} anniversaire${anniv > 1 ? "s" : ""} de fidélité ce mois-ci`,
      text: "Un client depuis un an ou plus : un merci fait toujours plaisir.",
    });
  }

  // Jour le plus calme sur les 8 dernières semaines (s'il y a assez de données)
  const days = await tx.$queryRaw<{ dow: number; visits: bigint }[]>`
    SELECT EXTRACT(ISODOW FROM (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE ${BUSINESS_TIMEZONE}))::int AS dow, COUNT(*) AS visits
    FROM point_transactions
    WHERE merchant_id = ${merchantId}::uuid AND type = 'EARN' AND occurred_at >= (now() AT TIME ZONE 'UTC') - interval '56 days'
    GROUP BY 1`;
  const total = days.reduce((s, d) => s + Number(d.visits), 0);
  if (total >= 30 && days.length >= 3) {
    const quiet = [...days].sort((a, b) => Number(a.visits) - Number(b.visits))[0];
    const regulars = count("regulars");
    if (regulars >= 1) {
      out.push({
        key: "quiet", icon: "⚡", templateKey: "double", segmentKey: "regulars", recipients: regulars,
        title: `Le ${DAYS[quiet.dow]} est votre jour le plus calme`,
        text: "Annoncez des points doublés ce jour-là à vos habitués.",
      });
    }
  }

  if (out.length === 0) {
    out.push({
      key: "news", icon: "✨", templateKey: "new", segmentKey: "all", recipients: count("all"),
      title: "Partagez une nouveauté",
      text: "Un nouveau produit, un service ? Prévenez vos clients en deux minutes.",
    });
  }
  return out.slice(0, 3);
}
