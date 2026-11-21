import { z } from "zod";
import type { Tx } from "../db";
import { withTenant } from "../db";
import type { Ctx } from "../context";
import { actorUserId } from "../context";
import { AppError, badRequest, conflict, notFound } from "../errors";
import { audit } from "../audit";
import { sms } from "../sms";
import { SMS_MARKETING } from "@/config/product";
import { messageTemplateByKey } from "@/config/message-templates";
import { localParts } from "./engagement";
import { getRules } from "./rules";
import { isSegmentKey, reachable, segmentMembers, SEGMENTS, type CustomerRow } from "./segments";
import { fillVariables, smsInfo } from "./sms-text";
import { revealPhone } from "./customers";

const DAY = 24 * 3600_000;

export const campaignInputSchema = z.object({
  segmentKey: z.string().refine(isSegmentKey, "Groupe inconnu"),
  templateKey: z.string().max(40),
  fields: z.record(z.string().trim().max(80)).default({}),
  freeText: z.string().trim().max(300).optional(),
  withOffer: z.boolean().default(true),
});
export type CampaignInput = z.infer<typeof campaignInputSchema>;

// ---------------------------------------------------------------------------
// Construction du message
// ---------------------------------------------------------------------------

/** Texte du message (avec les variables propres à chaque client) et offre éventuelle. */
export function buildMessage(input: CampaignInput) {
  const t = messageTemplateByKey(input.templateKey);
  if (!t) throw badRequest("UNKNOWN_TEMPLATE", "Modèle inconnu");
  if (t.key === "free") {
    if (!input.freeText || input.freeText.length < 5) throw badRequest("MESSAGE_REQUIRED", "Écrivez votre message");
    return { body: input.freeText, offerTitle: null, offerDays: t.offerDays };
  }
  for (const f of t.fields) {
    if (!input.fields[f.key]) throw badRequest("FIELD_REQUIRED", `Complétez : ${f.label}`);
  }
  const body = fillVariables(t.text, input.fields);
  const offerTitle = input.withOffer && t.offer ? fillVariables(t.offer, input.fields) : null;
  return { body, offerTitle: offerTitle ? offerTitle.charAt(0).toUpperCase() + offerTitle.slice(1) : null, offerDays: t.offerDays };
}

/** Variables propres à chaque client. */
export function recipientVariables(c: Pick<CustomerRow, "firstName" | "balance" | "nextReward">, merchantName: string) {
  return {
    prenom: c.firstName ?? "",
    commerce: merchantName,
    points: c.balance,
    points_manquants: c.nextReward?.missing ?? "",
    recompense: c.nextReward?.name ?? "prochaine récompense",
  };
}

export const finalText = (body: string) => `${body} ${SMS_MARKETING.optOutMention}`;

/** Plage d'envoi autorisée (heure locale du commerce). */
export function sendWindow(now: Date) {
  const { isoDay, minute } = localParts(now);
  const w = SMS_MARKETING.sendWindow;
  if (isoDay === 7 && !w.sunday) return { open: false, reason: "Pas d'envoi le dimanche : vos clients se reposent." };
  if (minute < w.startHour * 60 || minute >= w.endHour * 60) {
    return { open: false, reason: `Les SMS partent entre ${w.startHour} h et ${w.endHour} h, pour ne pas déranger vos clients.` };
  }
  return { open: true as const, reason: null };
}

// ---------------------------------------------------------------------------
// Aperçu
// ---------------------------------------------------------------------------

export async function previewCampaign(tx: Tx, merchantId: string, input: CampaignInput, now = new Date()) {
  const { body, offerTitle } = buildMessage(input);
  const [rules, merchant, members] = await Promise.all([
    getRules(tx, merchantId),
    tx.merchant.findUniqueOrThrow({ where: { id: merchantId }, select: { name: true } }),
    segmentMembers(tx, merchantId, input.segmentKey as never, now),
  ]);
  const ok = members.filter((m) => reachable(m, rules.smsMaxPerMonth));
  const sampleCustomer = ok.find((m) => m.firstName) ?? ok[0] ?? members[0] ?? { firstName: "Léa", balance: 120, nextReward: { name: "Café offert", pointsCost: 150, missing: 30 } };
  // Le plus long message réel détermine le nombre de SMS facturés
  const texts = (ok.length ? ok : [sampleCustomer]).map((c) => finalText(fillVariables(body, recipientVariables(c, merchant.name))));
  const longest = texts.reduce((a, b) => (smsInfo(b).length > smsInfo(a).length ? b : a), texts[0]);
  const info = smsInfo(longest);
  const window = sendWindow(now);
  return {
    sample: finalText(fillVariables(body, recipientVariables(sampleCustomer, merchant.name))),
    sampleName: sampleCustomer.firstName,
    offerTitle,
    info,
    tooLong: info.parts > SMS_MARKETING.maxParts,
    segment: SEGMENTS.find((s) => s.key === input.segmentKey)!,
    members: members.length,
    recipients: ok.length,
    excluded: {
      noConsent: members.filter((m) => !m.marketingSms).length,
      monthlyLimit: members.filter((m) => m.marketingSms && m.sms30 >= rules.smsMaxPerMonth).length,
    },
    costCents: ok.length * info.parts * SMS_MARKETING.estimatedCostCentsPerSms,
    window,
    maxPerMonth: rules.smsMaxPerMonth,
  };
}

// ---------------------------------------------------------------------------
// Envoi
// ---------------------------------------------------------------------------

/**
 * Envoie une campagne. Orchestration en plusieurs transactions : la campagne et la liste des
 * destinataires sont enregistrées d'abord, puis chaque SMS est envoyé et son statut noté
 * (un échec réseau n'annule pas les envois déjà faits).
 * Seuls les clients ayant accepté le marketing SMS, sous la limite mensuelle, sont contactés.
 */
export async function sendCampaign(ctx: Ctx, input: CampaignInput, now = new Date()) {
  const prepared = await withTenant(ctx.merchantId, async (tx) => {
    const p = await previewCampaign(tx, ctx.merchantId, input, now);
    if (!p.window.open) throw new AppError(409, "OUTSIDE_SEND_WINDOW", p.window.reason ?? "Envoi impossible maintenant");
    if (p.tooLong) throw badRequest("MESSAGE_TOO_LONG", "Message trop long : raccourcissez-le");
    if (p.recipients === 0) throw conflict("NO_RECIPIENTS", "Aucun client de ce groupe n'a accepté les offres par SMS");
    const { body, offerTitle, offerDays } = buildMessage(input);
    const rules = await getRules(tx, ctx.merchantId);
    const members = (await segmentMembers(tx, ctx.merchantId, input.segmentKey as never, now)).filter((m) => reachable(m, rules.smsMaxPerMonth));
    const merchant = await tx.merchant.findUniqueOrThrow({ where: { id: ctx.merchantId }, select: { name: true } });
    const campaign = await tx.campaign.create({
      data: {
        merchantId: ctx.merchantId,
        segmentKey: input.segmentKey,
        templateKey: input.templateKey,
        message: body,
        offerTitle,
        offerValidUntil: offerTitle ? new Date(now.getTime() + offerDays * DAY) : null,
        recipientsCount: members.length,
        createdById: actorUserId(ctx.actor),
      },
    });
    await tx.campaignRecipient.createMany({
      data: members.map((m) => ({ merchantId: ctx.merchantId, campaignId: campaign.id, customerId: m.id })),
    });
    await audit(tx, {
      merchantId: ctx.merchantId,
      actor: ctx.actor,
      action: "campaign.send",
      entityType: "campaign",
      entityId: campaign.id,
      metadata: { segment: input.segmentKey, template: input.templateKey, recipients: members.length },
    });
    return { campaign, members, body, merchantName: merchant.name };
  });

  let sent = 0;
  let failed = 0;
  for (const m of prepared.members) {
    const text = finalText(fillVariables(prepared.body, recipientVariables(m, prepared.merchantName)));
    await withTenant(ctx.merchantId, async (tx) => {
      const phone = await revealPhone(tx, m.id);
      try {
        if (!phone) throw new Error("Numéro introuvable");
        await sms().send(phone, text);
        sent++;
        await tx.campaignRecipient.update({
          where: { campaignId_customerId: { campaignId: prepared.campaign.id, customerId: m.id } },
          data: { status: "SENT", sentAt: new Date() },
        });
      } catch (e) {
        failed++;
        await tx.campaignRecipient.update({
          where: { campaignId_customerId: { campaignId: prepared.campaign.id, customerId: m.id } },
          data: { status: "FAILED", error: e instanceof Error ? e.message.slice(0, 200) : "Erreur" },
        });
      }
    });
  }
  await withTenant(ctx.merchantId, (tx) =>
    tx.campaign.update({ where: { id: prepared.campaign.id }, data: { status: "SENT", sentAt: new Date() } }),
  );
  return { campaignId: prepared.campaign.id, sent, failed };
}

// ---------------------------------------------------------------------------
// Résultats
// ---------------------------------------------------------------------------

/**
 * Résultats mesurés : destinataires venus en magasin dans les 7 jours suivant l'envoi,
 * leurs achats sur cette période, offres utilisées au comptoir.
 */
export async function campaignResults(tx: Tx, merchantId: string, campaignId?: string) {
  const campaigns = await tx.campaign.findMany({
    where: { merchantId, ...(campaignId ? { id: campaignId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return Promise.all(
    campaigns.map(async (c) => {
      const [stats] = await tx.$queryRaw<{ sent: bigint; failed: bigint; visitors: bigint; revenue: bigint | null; redeemed: bigint }[]>`
        SELECT
          COUNT(*) FILTER (WHERE cr.status = 'SENT') AS sent,
          COUNT(*) FILTER (WHERE cr.status = 'FAILED') AS failed,
          COUNT(*) FILTER (WHERE cr.redeemed_at IS NOT NULL) AS redeemed,
          COUNT(DISTINCT v.customer_id) AS visitors,
          (SELECT SUM(pt.purchase_amount_cents) FROM point_transactions pt
             JOIN campaign_recipients r2 ON r2.customer_id = pt.customer_id AND r2.campaign_id = ${c.id}::uuid AND r2.status = 'SENT'
            WHERE pt.type = 'EARN' AND pt.occurred_at >= r2.sent_at AND pt.occurred_at < r2.sent_at + interval '7 days') AS revenue
        FROM campaign_recipients cr
        LEFT JOIN LATERAL (
          SELECT pt.customer_id FROM point_transactions pt
          WHERE cr.status = 'SENT' AND pt.customer_id = cr.customer_id AND pt.type = 'EARN'
            AND pt.occurred_at >= cr.sent_at AND pt.occurred_at < cr.sent_at + interval '7 days'
          LIMIT 1
        ) v ON true
        WHERE cr.campaign_id = ${c.id}::uuid`;
      const t = messageTemplateByKey(c.templateKey ?? "");
      return {
        id: c.id,
        title: t ? t.label : "Message",
        templateKey: c.templateKey,
        message: c.message,
        offerTitle: c.offerTitle,
        offerValidUntil: c.offerValidUntil,
        segment: SEGMENTS.find((s) => s.key === c.segmentKey)?.label ?? c.segmentKey,
        sentAt: c.sentAt ?? c.createdAt,
        status: c.status,
        sent: Number(stats.sent),
        failed: Number(stats.failed),
        visitors: Number(stats.visitors),
        revenueCents: Number(stats.revenue ?? 0),
        redeemed: Number(stats.redeemed),
      };
    }),
  );
}

// ---------------------------------------------------------------------------
// Offres au comptoir
// ---------------------------------------------------------------------------

/** Offres reçues par SMS, encore valables et pas encore utilisées. */
export async function activeOffers(tx: Tx, customerId: string, now = new Date()) {
  const rows = await tx.campaignRecipient.findMany({
    where: { customerId, status: "SENT", redeemedAt: null, campaign: { offerTitle: { not: null }, offerValidUntil: { gt: now } } },
    include: { campaign: { select: { offerTitle: true, offerValidUntil: true } } },
    orderBy: { sentAt: "desc" },
  });
  return rows.map((r) => ({ id: r.id, title: r.campaign.offerTitle!, validUntil: r.campaign.offerValidUntil! }));
}

/** Le vendeur marque l'offre comme utilisée. */
export async function redeemOffer(tx: Tx, ctx: Ctx, recipientId: string, now = new Date()) {
  const r = await tx.campaignRecipient.findUnique({ where: { id: recipientId }, include: { campaign: true } });
  if (!r || !r.campaign.offerTitle) throw notFound("Offre");
  if (r.redeemedAt) throw conflict("OFFER_ALREADY_USED", "Offre déjà utilisée");
  if (!r.campaign.offerValidUntil || r.campaign.offerValidUntil < now) throw conflict("OFFER_EXPIRED", "Cette offre a expiré");
  await tx.campaignRecipient.update({ where: { id: r.id }, data: { redeemedAt: now, redeemedById: actorUserId(ctx.actor) } });
  await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "offer.redeem", entityType: "campaign_recipient", entityId: r.id, metadata: { campaignId: r.campaignId } });
  return { ok: true, title: r.campaign.offerTitle };
}
