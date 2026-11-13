import { z } from "zod";
import type { DataRequestStatus, DataRequestType } from "@prisma/client";
import type { Tx } from "../db";
import type { Ctx } from "../context";
import { actorUserId } from "../context";
import { conflict, notFound } from "../errors";
import { audit } from "../audit";
import { encrypt } from "../crypto";
import { maskPhone, normalizePhone } from "../phone";
import { addMonths } from "../time";
import { PRODUCT_NAME } from "@/config/product";
import { getBalance } from "./points";
import { currentConsents, recordConsent } from "./consents";
import { getPhoneIdentifier, phoneLookup, revealPhone } from "./customers";

async function loadLiveCustomer(tx: Tx, customerId: string) {
  const c = await tx.customer.findUnique({ where: { id: customerId }, include: { currentTier: true } });
  if (!c || c.anonymizedAt) throw notFound("Client");
  return c;
}

/** Droit d'accès et portabilité : toutes les données du client, lisibles et réutilisables (JSON). */
export async function exportCustomerData(tx: Tx, ctx: Ctx, customerId: string) {
  const c = await loadLiveCustomer(tx, customerId);
  const merchant = await tx.merchant.findUniqueOrThrow({ where: { id: ctx.merchantId } });
  const [phone, consents, transactions, redemptions, spins, balance] = await Promise.all([
    revealPhone(tx, c.id),
    tx.consent.findMany({ where: { customerId: c.id }, orderBy: { createdAt: "asc" } }),
    tx.pointTransaction.findMany({ where: { customerId: c.id }, orderBy: { occurredAt: "asc" } }),
    tx.redemption.findMany({ where: { customerId: c.id }, include: { reward: true }, orderBy: { createdAt: "asc" } }),
    tx.wheelSpin.findMany({ where: { customerId: c.id }, orderBy: { createdAt: "asc" } }),
    getBalance(tx, c.id),
  ]);
  await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "customer.export", entityType: "customer", entityId: c.id });
  return {
    generatedAt: new Date().toISOString(),
    controller: { name: merchant.name, vatNumber: merchant.vatNumber, address: [merchant.addressLine1, merchant.postalCode, merchant.city].filter(Boolean).join(", ") },
    processor: PRODUCT_NAME,
    customer: {
      id: c.id,
      phone,
      firstName: c.firstName,
      enrolledAt: c.enrolledAt,
      lastVisitAt: c.lastVisitAt,
      phoneVerifiedAt: c.phoneVerifiedAt,
      tier: c.currentTier?.name ?? null,
      pointsBalance: balance,
      hasPin: !!c.pinHash,
    },
    consents: consents.map((x) => ({ type: x.type, granted: x.granted, textVersion: x.textVersion, at: x.createdAt })),
    pointTransactions: transactions.map((t) => ({
      type: t.type,
      points: t.points,
      purchaseAmountEur: t.purchaseAmountCents != null ? t.purchaseAmountCents / 100 : null,
      reason: t.reason,
      at: t.occurredAt,
    })),
    redemptions: redemptions.map((r) => ({ reward: r.reward.name, at: r.createdAt, canceledAt: r.canceledAt })),
    wheelSpins: spins.map((s) => ({ prize: s.prizeLabel, date: s.spinDate })),
  };
}

export const rectifySchema = z.object({
  firstName: z.string().trim().max(40).nullish(),
  phone: z.string().min(6).max(20).optional(),
});

/** Droit de rectification (prénom, numéro). */
export async function rectifyCustomer(tx: Tx, ctx: Ctx, customerId: string, input: z.infer<typeof rectifySchema>) {
  const c = await loadLiveCustomer(tx, customerId);
  const changed: string[] = [];
  if (input.firstName !== undefined) {
    await tx.customer.update({ where: { id: c.id }, data: { firstName: input.firstName || null } });
    changed.push("firstName");
  }
  if (input.phone) {
    const e164 = normalizePhone(input.phone);
    const hash = phoneLookup(e164);
    const clash = await tx.customerIdentifier.findUnique({ where: { merchantId_type_lookupHash: { merchantId: ctx.merchantId, type: "PHONE", lookupHash: hash } } });
    if (clash && clash.customerId !== c.id) throw conflict("PHONE_TAKEN", "Ce numéro est déjà utilisé par un autre client");
    if (!clash) {
      await tx.customerIdentifier.deleteMany({ where: { customerId: c.id, type: "PHONE" } });
      await tx.customerIdentifier.create({
        data: { merchantId: ctx.merchantId, customerId: c.id, type: "PHONE", lookupHash: hash, valueEnc: encrypt(e164), displayHint: maskPhone(e164) },
      });
      changed.push("phone");
    }
  }
  await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "customer.rectify", entityType: "customer", entityId: c.id, metadata: { fields: changed } });
  return { changed };
}

export async function optOutMarketing(tx: Tx, ctx: Ctx, customerId: string) {
  const c = await loadLiveCustomer(tx, customerId);
  await recordConsent(tx, ctx, c.id, "MARKETING_SMS", false);
  await recordConsent(tx, ctx, c.id, "MARKETING_EMAIL", false);
  await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "customer.marketing_opt_out", entityType: "customer", entityId: c.id });
  return currentConsents(tx, c.id);
}

/**
 * Droit à l'effacement : anonymisation irréversible. Numéro, prénom et PIN sont supprimés ;
 * les mouvements de points restent rattachés à un identifiant qui ne désigne plus personne,
 * pour que les statistiques du commerçant restent justes.
 */
export async function eraseCustomer(tx: Tx, ctx: Ctx, customerId: string, reason: string) {
  const c = await loadLiveCustomer(tx, customerId);
  const ident = await getPhoneIdentifier(tx, c.id);
  if (ident) await tx.phoneVerification.deleteMany({ where: { merchantId: ctx.merchantId, lookupHash: ident.lookupHash } });
  await tx.customerIdentifier.deleteMany({ where: { customerId: c.id } });
  await tx.kioskSession.updateMany({ where: { customerId: c.id, status: { in: ["AWAITING_AUTH", "IDENTIFIED"] } }, data: { status: "CANCELED" } });
  await tx.customer.update({
    where: { id: c.id },
    data: { firstName: null, pinHash: null, pinFailedAttempts: 0, pinLockedUntil: null, currentTierId: null, anonymizedAt: new Date() },
  });
  await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "customer.erase", entityType: "customer", entityId: c.id, reason });
}

/** Job : anonymise les clients inactifs au-delà de la durée de conservation, et les inscriptions non vérifiées. */
export async function applyRetention(tx: Tx, ctx: Ctx, now = new Date(), unverifiedTtlHours = 24) {
  const rules = await tx.rules.findUniqueOrThrow({ where: { merchantId: ctx.merchantId } });
  const cutoff = addMonths(now, -rules.inactivityRetentionMonths);
  const inactive = await tx.customer.findMany({
    where: {
      merchantId: ctx.merchantId,
      anonymizedAt: null,
      OR: [
        { lastVisitAt: { lt: cutoff } },
        { lastVisitAt: null, enrolledAt: { lt: cutoff } },
        { phoneVerifiedAt: null, enrolledAt: { lt: new Date(now.getTime() - unverifiedTtlHours * 3600_000) } },
      ],
    },
    select: { id: true, phoneVerifiedAt: true },
  });
  for (const c of inactive) {
    await eraseCustomer(tx, ctx, c.id, c.phoneVerifiedAt ? "Durée de conservation dépassée" : "Inscription non finalisée");
  }
  return inactive.length;
}

// ---------------------------------------------------------------------------
// Suivi des demandes RGPD
// ---------------------------------------------------------------------------

export const dataRequestSchema = z.object({
  customerId: z.string().uuid().nullish(),
  type: z.enum(["ACCESS", "PORTABILITY", "RECTIFICATION", "ERASURE", "MARKETING_OPT_OUT"]),
  notes: z.string().max(1000).nullish(),
});

export async function createDataRequest(tx: Tx, ctx: Ctx, input: z.infer<typeof dataRequestSchema>) {
  const now = new Date();
  return tx.dataRequest.create({
    data: {
      merchantId: ctx.merchantId,
      customerId: input.customerId ?? null,
      type: input.type as DataRequestType,
      notes: input.notes ?? null,
      requestedAt: now,
      dueAt: addMonths(now, 1), // délai légal : 1 mois (art. 12.3 RGPD)
    },
  });
}

export async function updateDataRequest(tx: Tx, ctx: Ctx, id: string, status: DataRequestStatus, notes?: string | null) {
  const r = await tx.dataRequest.findUnique({ where: { id } });
  if (!r) throw notFound("Demande");
  const closing = status === "CLOSED" || status === "REJECTED";
  const updated = await tx.dataRequest.update({
    where: { id },
    data: { status, notes: notes ?? r.notes, closedAt: closing ? new Date() : null, handledById: actorUserId(ctx.actor) },
  });
  await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "data_request.update", entityType: "data_request", entityId: id, metadata: { status } });
  return updated;
}
