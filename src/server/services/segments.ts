import type { Tx } from "../db";
import { POSITIVE_EARN_TYPES } from "./points";
import { getRules } from "./rules";

/** Groupes de clients prêts à l'emploi (pas de filtre à construire). */
export const SEGMENTS = [
  { key: "all", icon: "👥", label: "Tous mes clients", description: "Tous les clients inscrits" },
  { key: "regulars", icon: "⭐", label: "Mes habitués", description: "Au moins 3 passages ces 60 derniers jours" },
  { key: "lapsed", icon: "💤", label: "Pas vus depuis 1 mois", description: "Venus avant, mais pas depuis plus de 30 jours" },
  { key: "new", icon: "🌱", label: "Nouveaux clients", description: "Inscrits ces 30 derniers jours" },
  { key: "best", icon: "🏆", label: "Mes meilleurs clients", description: "Le quart qui a gagné le plus de points en 90 jours" },
  { key: "nearReward", icon: "🎁", label: "Proches d'une récompense", description: "Il leur manque peu de points" },
  { key: "anniversary", icon: "🎂", label: "Anniversaire de fidélité", description: "Inscrits il y a un an ou plus, ce mois-ci" },
] as const;
export type SegmentKey = (typeof SEGMENTS)[number]["key"];
export const isSegmentKey = (k: string): k is SegmentKey => SEGMENTS.some((s) => s.key === k);

export interface CustomerRow {
  id: string;
  firstName: string | null;
  maskedPhone: string | null;
  enrolledAt: Date;
  lastVisitAt: Date | null;
  visits: number;
  visits60: number;
  balance: number;
  earned90: number;
  marketingSms: boolean;
  sms30: number;
  nextReward: { name: string; pointsCost: number; missing: number } | null;
}

const DAY = 24 * 3600_000;

/** Une ligne par client actif, avec ce qu'il faut pour classer et contacter. */
export async function loadCustomerRows(tx: Tx, merchantId: string, now = new Date()): Promise<CustomerRow[]> {
  const iso60 = new Date(now.getTime() - 60 * DAY).toISOString();
  const iso90 = new Date(now.getTime() - 90 * DAY).toISOString();
  const iso30 = new Date(now.getTime() - 30 * DAY).toISOString();
  const positive = [...POSITIVE_EARN_TYPES];
  const rows = await tx.$queryRaw<
    { id: string; first_name: string | null; enrolled_at: Date; last_visit_at: Date | null; masked: string | null; visits: bigint; visits60: bigint; balance: bigint; earned90: bigint; sms_ok: boolean | null; sms30: bigint }[]
  >`
    SELECT c.id, c.first_name, c.enrolled_at, c.last_visit_at,
      (SELECT ci.display_hint FROM customer_identifiers ci WHERE ci.customer_id = c.id AND ci.type = 'PHONE' AND ci.revoked_at IS NULL LIMIT 1) AS masked,
      COUNT(pt.id) FILTER (WHERE pt.type = 'EARN') AS visits,
      COUNT(pt.id) FILTER (WHERE pt.type = 'EARN' AND pt.occurred_at >= (${iso60}::timestamptz AT TIME ZONE 'UTC')) AS visits60,
      COALESCE(SUM(pt.points), 0) AS balance,
      COALESCE(SUM(pt.points) FILTER (WHERE pt.type::text = ANY(${positive}) AND pt.occurred_at >= (${iso90}::timestamptz AT TIME ZONE 'UTC')), 0) AS earned90,
      (SELECT co.granted FROM consents co WHERE co.customer_id = c.id AND co.type = 'MARKETING_SMS' ORDER BY co.created_at DESC LIMIT 1) AS sms_ok,
      (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.customer_id = c.id AND cr.status = 'SENT' AND cr.sent_at >= (${iso30}::timestamptz AT TIME ZONE 'UTC')) AS sms30
    FROM customers c
    LEFT JOIN point_transactions pt ON pt.customer_id = c.id
    WHERE c.merchant_id = ${merchantId}::uuid AND c.anonymized_at IS NULL AND c.phone_verified_at IS NOT NULL
    GROUP BY c.id`;
  const rewards = await tx.reward.findMany({ where: { merchantId, active: true }, orderBy: { pointsCost: "asc" } });
  return rows.map((r) => {
    const balance = Number(r.balance);
    const next = rewards.find((w) => w.pointsCost > balance && (w.stock === null || w.stock > 0));
    return {
      id: r.id,
      firstName: r.first_name,
      maskedPhone: r.masked,
      enrolledAt: r.enrolled_at,
      lastVisitAt: r.last_visit_at,
      visits: Number(r.visits),
      visits60: Number(r.visits60),
      balance,
      earned90: Number(r.earned90),
      marketingSms: !!r.sms_ok,
      sms30: Number(r.sms30),
      nextReward: next ? { name: next.name, pointsCost: next.pointsCost, missing: next.pointsCost - balance } : null,
    };
  });
}

/** Appartenance à un groupe (fonction pure, testée). */
export function inSegment(key: SegmentKey, c: CustomerRow, ctx: { now: Date; bestThreshold: number }): boolean {
  const { now } = ctx;
  switch (key) {
    case "all":
      return true;
    case "regulars":
      return c.visits60 >= 3;
    case "lapsed": {
      if (!c.lastVisitAt) return false;
      const days = (now.getTime() - c.lastVisitAt.getTime()) / DAY;
      return days > 30 && days <= 365;
    }
    case "new":
      return now.getTime() - c.enrolledAt.getTime() <= 30 * DAY;
    case "best":
      return c.earned90 > 0 && c.earned90 >= ctx.bestThreshold;
    case "nearReward":
      return !!c.nextReward && c.nextReward.missing <= Math.max(10, Math.round(c.nextReward.pointsCost * 0.25));
    case "anniversary": {
      const years = now.getUTCFullYear() - c.enrolledAt.getUTCFullYear();
      return years >= 1 && c.enrolledAt.getUTCMonth() === now.getUTCMonth();
    }
  }
}

/** Seuil du « meilleur quart » sur les points gagnés en 90 jours. */
export function bestThreshold(rows: CustomerRow[]) {
  const sorted = rows.map((r) => r.earned90).filter((v) => v > 0).sort((a, b) => b - a);
  if (sorted.length === 0) return Infinity;
  return sorted[Math.max(0, Math.ceil(sorted.length / 4) - 1)];
}

/** Peut-on lui envoyer une offre par SMS ? (accord marketing + limite mensuelle) */
export const reachable = (c: CustomerRow, maxPerMonth: number) => c.marketingSms && c.sms30 < maxPerMonth;

export async function segmentMembers(tx: Tx, merchantId: string, key: SegmentKey, now = new Date()) {
  const rows = await loadCustomerRows(tx, merchantId, now);
  const ctx = { now, bestThreshold: bestThreshold(rows) };
  return rows.filter((r) => inSegment(key, r, ctx));
}

/** Les groupes avec leur taille et le nombre de clients joignables par SMS. */
export async function listSegments(tx: Tx, merchantId: string, now = new Date()) {
  const rules = await getRules(tx, merchantId);
  const rows = await loadCustomerRows(tx, merchantId, now);
  const ctx = { now, bestThreshold: bestThreshold(rows) };
  return SEGMENTS.map((s) => {
    const members = rows.filter((r) => inSegment(s.key, r, ctx));
    return { ...s, count: members.length, reachable: members.filter((m) => reachable(m, rules.smsMaxPerMonth)).length };
  });
}
