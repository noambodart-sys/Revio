import { Prisma, type Rules, type TierLevel } from "@prisma/client";
import type { Tx } from "../db";
import type { Ctx } from "../context";
import { actorDeviceId, actorUserId } from "../context";
import { AppError, badRequest, notFound } from "../errors";
import { audit } from "../audit";
import { addMonths } from "../time";
import { BUSINESS_TIMEZONE } from "@/config/product";
import { getRules } from "./rules";

const POSITIVE_EARN_TYPES = ["EARN", "TIER_BONUS", "WHEEL_BONUS"] as const;

// ---------------------------------------------------------------------------
// Calculs purs (testés unitairement)
// ---------------------------------------------------------------------------

/** Points de base d'un achat. Arithmétique entière : jamais de flottant sur les montants. */
export function computeBaseEarn(
  rules: Pick<Rules, "earnMode" | "pointsPerEuro" | "pointsPerVisit" | "minPurchaseCents">,
  amountCents: number,
): number {
  if (amountCents < rules.minPurchaseCents) return 0;
  if (rules.earnMode === "PER_VISIT") return rules.pointsPerVisit;
  const ppeHundredths = new Prisma.Decimal(rules.pointsPerEuro).mul(100).toNumber();
  return Math.floor((amountCents * Math.round(ppeHundredths)) / 10_000); // arrondi à l'inférieur
}

export const computeTierBonus = (base: number, bonusPercent: number) => Math.floor((base * bonusPercent) / 100);

/** Applique le plafond quotidien anti-fraude. */
export function applyDailyCap(requested: number, alreadyToday: number, cap: number | null) {
  if (cap === null) return { granted: requested, capped: false };
  const room = Math.max(0, cap - alreadyToday);
  return { granted: Math.min(requested, room), capped: requested > room };
}

/** Niveau atteint selon les points gagnés sur la fenêtre glissante. */
export function pickTier<T extends Pick<TierLevel, "minPoints" | "rank">>(tiers: T[], earnedInWindow: number): T | null {
  const sorted = [...tiers].sort((a, b) => b.rank - a.rank);
  return sorted.find((t) => earnedInWindow >= t.minPoints) ?? null;
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/** Solde = somme des mouvements. Jamais stocké. */
export async function getBalance(tx: Tx, customerId: string): Promise<number> {
  const r = await tx.pointTransaction.aggregate({ where: { customerId }, _sum: { points: true } });
  return r._sum.points ?? 0;
}

export async function earnedToday(tx: Tx, customerId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ total: bigint | null }[]>`
    SELECT SUM(points) AS total FROM point_transactions
    WHERE customer_id = ${customerId}::uuid
      AND type IN ('EARN', 'TIER_BONUS', 'WHEEL_BONUS')
      AND (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE ${BUSINESS_TIMEZONE})::date
        = (now() AT TIME ZONE ${BUSINESS_TIMEZONE})::date`;
  return Number(rows[0]?.total ?? 0);
}

export async function earnedSince(tx: Tx, customerId: string, since: Date): Promise<number> {
  const r = await tx.pointTransaction.aggregate({
    where: { customerId, type: { in: [...POSITIVE_EARN_TYPES] }, occurredAt: { gte: since } },
    _sum: { points: true },
  });
  return r._sum.points ?? 0;
}

/**
 * Verrouille la ligne du client pour la durée de la transaction : deux opérations
 * simultanées (double clic, deux caisses) ne peuvent pas dépenser le même solde.
 */
export async function lockCustomer(tx: Tx, customerId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM customers WHERE id = ${customerId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw notFound("Client");
  const c = await tx.customer.findUniqueOrThrow({ where: { id: customerId }, include: { currentTier: true } });
  if (c.anonymizedAt) throw new AppError(410, "CUSTOMER_ERASED", "Ce client a été supprimé");
  return c;
}

/** Recalcule et met en cache le niveau du client. */
export async function refreshTier(tx: Tx, rules: Rules, customerId: string) {
  if (!rules.tiersEnabled) {
    await tx.customer.update({ where: { id: customerId }, data: { currentTierId: null } });
    return null;
  }
  const tiers = await tx.tierLevel.findMany({ where: { merchantId: rules.merchantId } });
  const earned = await earnedSince(tx, customerId, addMonths(new Date(), -rules.tierWindowMonths));
  const tier = pickTier(tiers, earned);
  await tx.customer.update({ where: { id: customerId }, data: { currentTierId: tier?.id ?? null } });
  return tier;
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

export interface PurchaseInput {
  customerId: string;
  amountCents: number;
  kioskSessionId?: string | null;
  /** Clé générée par l'appareil : rejouer la même requête (resync hors-ligne) ne crédite qu'une fois. */
  idempotencyKey?: string | null;
  occurredAt?: Date | null;
}

export interface PurchaseResult {
  transactionId: string;
  basePoints: number;
  bonusPoints: number;
  earned: number;
  capped: boolean;
  balance: number;
  tier: { name: string; bonusPercent: number } | null;
  replayed: boolean;
}

async function replayPurchase(tx: Tx, merchantId: string, key: string): Promise<PurchaseResult | null> {
  const prev = await tx.pointTransaction.findUnique({
    where: { merchantId_idempotencyKey: { merchantId, idempotencyKey: key } },
    include: { derivedTransactions: true, customer: { include: { currentTier: true } } },
  });
  if (!prev) return null;
  const bonus = prev.derivedTransactions.filter((t) => t.type === "TIER_BONUS").reduce((s, t) => s + t.points, 0);
  return {
    transactionId: prev.id,
    basePoints: prev.points,
    bonusPoints: bonus,
    earned: prev.points + bonus,
    capped: false,
    balance: await getBalance(tx, prev.customerId),
    tier: prev.customer.currentTier ? { name: prev.customer.currentTier.name, bonusPercent: prev.customer.currentTier.bonusPercent } : null,
    replayed: true,
  };
}

export async function recordPurchase(tx: Tx, ctx: Ctx, input: PurchaseInput): Promise<PurchaseResult> {
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0 || input.amountCents > 10_000_00) {
    throw badRequest("INVALID_AMOUNT", "Montant invalide");
  }
  if (input.idempotencyKey) {
    const prev = await replayPurchase(tx, ctx.merchantId, input.idempotencyKey);
    if (prev) return prev;
  }
  const now = new Date();
  const occurredAt = input.occurredAt && input.occurredAt < now ? input.occurredAt : now;

  const customer = await lockCustomer(tx, input.customerId);
  if (!customer.phoneVerifiedAt) throw badRequest("PHONE_NOT_VERIFIED", "Inscription non finalisée (numéro non vérifié)");

  if (input.kioskSessionId) {
    const s = await tx.kioskSession.findUnique({ where: { id: input.kioskSessionId } });
    if (!s || s.customerId !== customer.id) throw notFound("Passage");
    if (s.status !== "IDENTIFIED") throw badRequest("SESSION_NOT_IDENTIFIED", "Ce passage n'est plus actif");
  }

  const rules = await getRules(tx, ctx.merchantId);
  const base = computeBaseEarn(rules, input.amountCents);
  const tierBonusPct = rules.tiersEnabled ? (customer.currentTier?.bonusPercent ?? 0) : 0;
  const rawBonus = computeTierBonus(base, tierBonusPct);

  const today = await earnedToday(tx, customer.id);
  const capBase = applyDailyCap(base, today, rules.dailyPointsCap);
  const capBonus = applyDailyCap(rawBonus, today + capBase.granted, rules.dailyPointsCap);
  const capped = capBase.capped || capBonus.capped;

  const common = {
    merchantId: ctx.merchantId,
    customerId: customer.id,
    staffUserId: actorUserId(ctx.actor),
    deviceId: actorDeviceId(ctx.actor),
    kioskSessionId: input.kioskSessionId ?? null,
    occurredAt,
  };
  const earnTx = await tx.pointTransaction.create({
    data: {
      ...common,
      type: "EARN",
      points: capBase.granted,
      purchaseAmountCents: input.amountCents,
      idempotencyKey: input.idempotencyKey ?? null,
    },
  });
  if (capBonus.granted > 0) {
    await tx.pointTransaction.create({
      data: { ...common, type: "TIER_BONUS", points: capBonus.granted, relatedTransactionId: earnTx.id },
    });
  }
  if (capped) {
    await audit(tx, {
      merchantId: ctx.merchantId,
      actor: ctx.actor,
      action: "fraud.daily_cap_reached",
      entityType: "customer",
      entityId: customer.id,
      metadata: { requested: base + rawBonus, granted: capBase.granted + capBonus.granted, cap: rules.dailyPointsCap },
    });
  }

  await tx.customer.update({
    where: { id: customer.id },
    data: { lastVisitAt: customer.lastVisitAt && customer.lastVisitAt > occurredAt ? customer.lastVisitAt : occurredAt },
  });
  const tier = await refreshTier(tx, rules, customer.id);

  if (input.kioskSessionId) {
    await tx.kioskSession.update({ where: { id: input.kioskSessionId }, data: { status: "COMPLETED", completedAt: now } });
  }

  return {
    transactionId: earnTx.id,
    basePoints: capBase.granted,
    bonusPoints: capBonus.granted,
    earned: capBase.granted + capBonus.granted,
    capped,
    balance: await getBalance(tx, customer.id),
    tier: tier ? { name: tier.name, bonusPercent: tier.bonusPercent } : null,
    replayed: false,
  };
}

/** Correction manuelle : motif obligatoire, tracée dans l'audit, alerte si anormale. */
export async function adjustPoints(tx: Tx, ctx: Ctx, input: { customerId: string; points: number; reason: string }) {
  const reason = input.reason.trim();
  if (reason.length < 3) throw badRequest("REASON_REQUIRED", "Le motif de la correction est obligatoire");
  if (!Number.isInteger(input.points) || input.points === 0 || Math.abs(input.points) > 100_000) {
    throw badRequest("INVALID_POINTS", "Nombre de points invalide");
  }
  const customer = await lockCustomer(tx, input.customerId);
  const balance = await getBalance(tx, customer.id);
  if (balance + input.points < 0) throw badRequest("NEGATIVE_BALANCE", "Le solde ne peut pas devenir négatif");

  const t = await tx.pointTransaction.create({
    data: {
      merchantId: ctx.merchantId,
      customerId: customer.id,
      type: "ADJUSTMENT",
      points: input.points,
      reason,
      staffUserId: actorUserId(ctx.actor),
    },
  });
  await audit(tx, {
    merchantId: ctx.merchantId,
    actor: ctx.actor,
    action: "points.adjust",
    entityType: "customer",
    entityId: customer.id,
    reason,
    metadata: { points: input.points, transactionId: t.id },
  });

  // Anti-fraude : nombre de corrections par ce vendeur aujourd'hui
  let alert = false;
  const staffId = actorUserId(ctx.actor);
  if (staffId) {
    const rules = await getRules(tx, ctx.merchantId);
    const rows = await tx.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM point_transactions
      WHERE staff_user_id = ${staffId}::uuid AND type = 'ADJUSTMENT'
        AND (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE ${BUSINESS_TIMEZONE})::date
          = (now() AT TIME ZONE ${BUSINESS_TIMEZONE})::date`;
    const n = Number(rows[0]?.n ?? 0);
    if (n >= rules.adjustmentAlertDailyCount) {
      alert = true;
      await audit(tx, {
        merchantId: ctx.merchantId,
        actor: ctx.actor,
        action: "fraud.adjustment_alert",
        entityType: "user",
        entityId: staffId,
        metadata: { adjustmentsToday: n, threshold: rules.adjustmentAlertDailyCount },
      });
    }
  }
  return { transactionId: t.id, balance: balance + input.points, alert };
}

/** Job : expire le solde des clients sans visite depuis pointsExpiryMonths. */
export async function expireInactivePoints(tx: Tx, merchantId: string, now = new Date()) {
  const rules = await getRules(tx, merchantId);
  const cutoff = addMonths(now, -rules.pointsExpiryMonths);
  const rows = await tx.$queryRaw<{ customer_id: string; balance: bigint }[]>`
    SELECT c.id AS customer_id, COALESCE(SUM(pt.points), 0) AS balance
    FROM customers c JOIN point_transactions pt ON pt.customer_id = c.id
    WHERE c.merchant_id = ${merchantId}::uuid AND c.anonymized_at IS NULL
      AND COALESCE(c.last_visit_at, c.enrolled_at) < (${cutoff.toISOString()}::timestamptz AT TIME ZONE 'UTC')
    GROUP BY c.id HAVING SUM(pt.points) > 0`;
  for (const r of rows) {
    await tx.pointTransaction.create({
      data: { merchantId, customerId: r.customer_id, type: "EXPIRATION", points: -Number(r.balance), occurredAt: now },
    });
  }
  return rows.length;
}
