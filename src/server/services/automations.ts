import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { Tx } from "../db";
import { systemDb, withTenant } from "../db";
import type { Ctx } from "../context";
import { badRequest } from "../errors";
import { audit } from "../audit";
import { AUTOMATIONS, automationDef, type AutomationKind } from "@/config/automation-templates";
import { BUSINESS_TIMEZONE } from "@/config/product";
import { addMonths } from "../time";
import { getRules } from "./rules";
import { loadCustomerRows, reachable, type CustomerRow } from "./segments";
import { deliverCampaign, finalText, sendWindow } from "./campaigns";
import { fillVariables, smsInfo } from "./sms-text";

const DAY = 24 * 3600_000;
const KINDS = AUTOMATIONS.map((a) => a.kind) as [AutomationKind, ...AutomationKind[]];

type Params = Record<string, string | number | null>;

// ---------------------------------------------------------------------------
// Qui doit recevoir quoi (fonctions pures, testées)
// ---------------------------------------------------------------------------

export interface EligibilityContext {
  now: Date;
  rules: { pointsExpiryMonths: number; expiryReminderDays: number };
  googleReviewUrl: string | null;
  /** Dernier envoi de CE message automatique à chaque client. */
  lastSent: Map<string, Date>;
}

/** Jour et mois locaux (anniversaire). */
function localMonthDay(d: Date) {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIMEZONE, month: "2-digit", day: "2-digit" }).format(d);
  return s; // « MM-DD »
}

export function isEligible(kind: AutomationKind, c: CustomerRow, params: Params, ctx: EligibilityContext): boolean {
  const { now, lastSent } = ctx;
  const last = lastSent.get(c.id) ?? null;
  const ago = (d: Date | null) => (d ? (now.getTime() - d.getTime()) / DAY : Infinity);
  switch (kind) {
    case "WELCOME":
      // Le lendemain : entre 12 h et 3 jours après l'inscription, une seule fois
      return !last && ago(c.enrolledAt) >= 0.5 && ago(c.enrolledAt) <= 3;
    case "REWARD_READY": {
      if (!c.affordableReward) return false;
      // Une fois par « cycle » : un nouvel envoi seulement après une récompense utilisée
      const since = c.lastRedeemAt && c.lastRedeemAt > c.enrolledAt ? c.lastRedeemAt : c.enrolledAt;
      // Pas pendant qu'il est au comptoir : au moins 3 h après sa dernière visite
      return (!last || last < since) && ago(c.lastVisitAt) >= 0.125;
    }
    case "WIN_BACK": {
      if (c.visits < 3 || !c.lastVisitAt || !c.firstVisitAt) return false;
      const rhythm = (c.lastVisitAt.getTime() - c.firstVisitAt.getTime()) / DAY / (c.visits - 1);
      const minDays = Number(params.minDays ?? 30);
      // Une seule relance par absence
      return ago(c.lastVisitAt) >= Math.max(minDays, 2 * rhythm) && (!last || last < c.lastVisitAt);
    }
    case "LOYALTY_ANNIVERSARY": {
      const years = now.getUTCFullYear() - c.enrolledAt.getUTCFullYear();
      if (years < 1) return false;
      // Le jour même ou dans les 3 jours (si le serveur était arrêté), une fois par an
      const target = localMonthDay(c.enrolledAt);
      const within = [0, 1, 2, 3].some((d) => localMonthDay(new Date(now.getTime() - d * DAY)) === target);
      return within && (!last || ago(last) > 300);
    }
    case "POINTS_EXPIRING": {
      if (c.balance <= 0 || !ctx.rules.expiryReminderDays) return false;
      const ref = c.lastVisitAt ?? c.enrolledAt;
      const expiry = addMonths(ref, ctx.rules.pointsExpiryMonths);
      const remind = new Date(expiry.getTime() - ctx.rules.expiryReminderDays * DAY);
      return now >= remind && now < expiry && (!last || last < ref);
    }
    case "REVIEW_REQUEST": {
      if (!ctx.googleReviewUrl) return false;
      // Une seule fois, juste après une visite (souvenir frais), à partir de la Ne visite
      return !last && c.visits >= Number(params.afterVisits ?? 3) && ago(c.lastVisitAt) <= 2;
    }
  }
}

export function expiryDate(c: Pick<CustomerRow, "lastVisitAt" | "enrolledAt">, months: number) {
  return addMonths(c.lastVisitAt ?? c.enrolledAt, months);
}

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------

async function lastSentMap(tx: Tx, merchantId: string, kind: AutomationKind) {
  const rows = await tx.$queryRaw<{ customer_id: string; last: Date }[]>`
    SELECT cr.customer_id, MAX(COALESCE(cr.sent_at, c.created_at)) AS last
    FROM campaign_recipients cr JOIN campaigns c ON c.id = cr.campaign_id
    WHERE c.merchant_id = ${merchantId}::uuid AND c.automation_kind = ${kind}
    GROUP BY cr.customer_id`;
  return new Map(rows.map((r) => [r.customer_id, r.last]));
}

/** Les 6 messages automatiques, avec leur réglage et leurs résultats sur 30 jours. */
export async function listAutomations(tx: Tx, merchantId: string) {
  const stored = await tx.automation.findMany({ where: { merchantId } });
  const merchant = await tx.merchant.findUniqueOrThrow({ where: { id: merchantId }, select: { googleReviewUrl: true } });
  const stats = await tx.$queryRaw<{ kind: string; sent: bigint; visitors: bigint; revenue: bigint | null }[]>`
    SELECT c.automation_kind AS kind,
      COUNT(*) FILTER (WHERE cr.status = 'SENT') AS sent,
      COUNT(DISTINCT cr.customer_id) FILTER (WHERE EXISTS (
        SELECT 1 FROM point_transactions pt WHERE pt.customer_id = cr.customer_id AND pt.type = 'EARN'
          AND pt.occurred_at >= cr.sent_at AND pt.occurred_at < cr.sent_at + interval '7 days')) AS visitors,
      (SELECT SUM(pt.purchase_amount_cents) FROM point_transactions pt
         JOIN campaign_recipients r2 ON r2.customer_id = pt.customer_id
         JOIN campaigns c2 ON c2.id = r2.campaign_id
        WHERE c2.merchant_id = ${merchantId}::uuid AND c2.automation_kind = c.automation_kind AND r2.status = 'SENT'
          AND r2.sent_at >= now() - interval '30 days'
          AND pt.type = 'EARN' AND pt.occurred_at >= r2.sent_at AND pt.occurred_at < r2.sent_at + interval '7 days') AS revenue
    FROM campaign_recipients cr JOIN campaigns c ON c.id = cr.campaign_id
    WHERE c.merchant_id = ${merchantId}::uuid AND c.automation_kind IS NOT NULL AND cr.sent_at >= now() - interval '30 days'
    GROUP BY c.automation_kind`;
  return AUTOMATIONS.map((def) => {
    const s = stored.find((x) => x.kind === def.kind);
    const st = stats.find((x) => x.kind === def.kind);
    return {
      kind: def.kind,
      label: def.label,
      when: def.when,
      settings: def.settings,
      canOffer: def.canOffer,
      enabled: s?.enabled ?? false,
      message: s?.message ?? def.defaultMessage,
      defaultMessage: def.defaultMessage,
      params: { ...def.defaultParams, ...((s?.params as Params) ?? {}) },
      needsReviewUrl: def.kind === "REVIEW_REQUEST" && !merchant.googleReviewUrl,
      last30: { sent: Number(st?.sent ?? 0), visitors: Number(st?.visitors ?? 0), revenueCents: Number(st?.revenue ?? 0) },
    };
  });
}

export const automationUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  message: z.string().trim().min(5).max(300).optional(),
  params: z
    .object({
      minDays: z.number().int().min(14).max(365).optional(),
      afterVisits: z.number().int().min(1).max(50).optional(),
      offer: z.string().trim().max(60).nullable().optional(),
      offerDays: z.number().int().min(1).max(90).optional(),
    })
    .optional(),
});

const ALLOWED_VARS = ["prenom", "commerce", "points", "recompense", "offre", "date_expiration", "lien_avis"];

export async function updateAutomation(tx: Tx, ctx: Ctx, kindRaw: string, input: z.infer<typeof automationUpdateSchema>) {
  const def = automationDef(kindRaw);
  if (!def) throw badRequest("UNKNOWN_AUTOMATION", "Message automatique inconnu");
  const existing = await tx.automation.findUnique({ where: { merchantId_kind: { merchantId: ctx.merchantId, kind: def.kind } } });
  const message = input.message ?? existing?.message ?? def.defaultMessage;
  const unknown = [...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((v) => !ALLOWED_VARS.includes(v));
  if (unknown.length) throw badRequest("UNKNOWN_VARIABLE", `Variable inconnue : {${unknown[0]}}`);
  if (smsInfo(finalText(message)).parts > 2) throw badRequest("MESSAGE_TOO_LONG", "Message trop long : 2 SMS maximum");
  const enabled = input.enabled ?? existing?.enabled ?? false;
  if (def.kind === "REVIEW_REQUEST" && enabled) {
    const m = await tx.merchant.findUniqueOrThrow({ where: { id: ctx.merchantId }, select: { googleReviewUrl: true } });
    if (!m.googleReviewUrl) throw badRequest("REVIEW_URL_REQUIRED", "Indiquez d'abord le lien de votre fiche Google (Apparence)");
    if (!message.includes("{lien_avis}")) throw badRequest("REVIEW_LINK_MISSING", "Le message doit contenir {lien_avis}");
  }
  const params = { ...def.defaultParams, ...((existing?.params as Params) ?? {}), ...(input.params ?? {}) } as Prisma.InputJsonValue;
  const saved = await tx.automation.upsert({
    where: { merchantId_kind: { merchantId: ctx.merchantId, kind: def.kind } },
    create: { merchantId: ctx.merchantId, kind: def.kind, enabled, message, params },
    update: { enabled, message, params },
  });
  await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "automation.update", entityType: "automation", entityId: saved.id, metadata: { kind: def.kind, enabled } });
  return saved;
}

/** Active les automatismes conseillés (au démarrage d'un commerce). */
export async function enableRecommendedAutomations(tx: Tx, ctx: Ctx) {
  for (const kind of ["WELCOME", "REWARD_READY", "WIN_BACK", "POINTS_EXPIRING"] as AutomationKind[]) {
    await updateAutomation(tx, ctx, kind, { enabled: true });
  }
}

// ---------------------------------------------------------------------------
// Exécution (job : toutes les heures)
// ---------------------------------------------------------------------------

/** Exécute le pilote automatique d'un commerce. Ne fait rien hors de la plage d'envoi. */
export async function runMerchantAutomations(merchantId: string, now = new Date()) {
  if (!sendWindow(now).open) return [];
  const ctx: Ctx = { merchantId, actor: { type: "SYSTEM" } };
  const plans = await withTenant(merchantId, async (tx) => {
    const autos = await tx.automation.findMany({ where: { merchantId, enabled: true } });
    if (!autos.length) return [];
    const [rules, merchant, rows] = await Promise.all([
      getRules(tx, merchantId),
      tx.merchant.findUniqueOrThrow({ where: { id: merchantId }, select: { name: true, googleReviewUrl: true } }),
      loadCustomerRows(tx, merchantId, now),
    ]);
    const used = new Map<string, number>(); // SMS déjà prévus pendant ce passage (limite mensuelle)
    const out: { campaignId: string; messages: { id: string; text: string }[]; kind: AutomationKind }[] = [];
    for (const a of autos) {
      const kind = a.kind as AutomationKind;
      const params = { ...automationDef(kind)!.defaultParams, ...((a.params as Params) ?? {}) };
      const ectx: EligibilityContext = { now, rules, googleReviewUrl: merchant.googleReviewUrl, lastSent: await lastSentMap(tx, merchantId, kind) };
      const targets = rows.filter(
        (c) => isEligible(kind, c, params, ectx) && reachable({ ...c, sms30: c.sms30 + (used.get(c.id) ?? 0) }, rules.smsMaxPerMonth),
      );
      if (!targets.length) continue;
      const offer = typeof params.offer === "string" && params.offer.trim() ? params.offer.trim() : null;
      const campaign = await tx.campaign.create({
        data: {
          merchantId,
          segmentKey: "auto",
          automationKind: kind,
          message: a.message,
          offerTitle: offer ? offer.charAt(0).toUpperCase() + offer.slice(1) : null,
          offerValidUntil: offer ? new Date(now.getTime() + Number(params.offerDays ?? 14) * DAY) : null,
          recipientsCount: targets.length,
        },
      });
      await tx.campaignRecipient.createMany({ data: targets.map((c) => ({ merchantId, campaignId: campaign.id, customerId: c.id })) });
      for (const c of targets) used.set(c.id, (used.get(c.id) ?? 0) + 1);
      const messages = targets.map((c) => ({
        id: c.id,
        text: finalText(
          fillVariables(a.message, {
            prenom: c.firstName ?? "",
            commerce: merchant.name,
            points: c.balance,
            recompense: c.affordableReward?.name ?? c.nextReward?.name ?? "récompense",
            offre: offer ?? "une petite attention",
            date_expiration: expiryDate(c, rules.pointsExpiryMonths).toLocaleDateString("fr-BE", { day: "numeric", month: "long" }),
            lien_avis: merchant.googleReviewUrl ?? "",
          }),
        ),
      }));
      await audit(tx, { merchantId, actor: ctx.actor, action: "automation.send", entityType: "campaign", entityId: campaign.id, metadata: { kind, recipients: targets.length } });
      out.push({ campaignId: campaign.id, messages, kind });
    }
    return out;
  });
  const report = [];
  for (const p of plans) report.push({ kind: p.kind, ...(await deliverCampaign(merchantId, p.campaignId, p.messages)) });
  return report;
}

/** Tous les commerces actifs. À lancer toutes les heures (cron). */
export async function runAllAutomations(now = new Date()) {
  const merchants = await systemDb().merchant.findMany({ where: { suspendedAt: null }, select: { id: true, name: true } });
  const out = [];
  for (const m of merchants) out.push({ merchant: m.name, sent: await runMerchantAutomations(m.id, now) });
  return out;
}

export { KINDS as AUTOMATION_KINDS };
