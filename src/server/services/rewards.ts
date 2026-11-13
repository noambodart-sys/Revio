import { z } from "zod";
import type { Tx } from "../db";
import type { Ctx } from "../context";
import { actorUserId } from "../context";
import { badRequest, conflict, notFound } from "../errors";
import { audit } from "../audit";
import { getBalance, lockCustomer } from "./points";

export const rewardSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).nullish(),
  pointsCost: z.number().int().positive().max(1_000_000),
  stock: z.number().int().min(0).nullish(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const listRewards = (tx: Tx, merchantId: string, onlyActive = true) =>
  tx.reward.findMany({
    where: { merchantId, ...(onlyActive ? { active: true } : {}) },
    orderBy: [{ sortOrder: "asc" }, { pointsCost: "asc" }],
  });

export async function createReward(tx: Tx, ctx: Ctx, data: z.infer<typeof rewardSchema>) {
  const r = await tx.reward.create({ data: { ...data, merchantId: ctx.merchantId } });
  await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "reward.create", entityType: "reward", entityId: r.id });
  return r;
}

export async function updateReward(tx: Tx, ctx: Ctx, id: string, data: Partial<z.infer<typeof rewardSchema>>) {
  const existing = await tx.reward.findUnique({ where: { id } });
  if (!existing) throw notFound("Récompense");
  const r = await tx.reward.update({ where: { id }, data });
  await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "reward.update", entityType: "reward", entityId: id, metadata: data });
  return r;
}

/** Remise d'une récompense : solde vérifié sous verrou, stock décrémenté atomiquement. */
export async function redeemReward(tx: Tx, ctx: Ctx, input: { customerId: string; rewardId: string }) {
  const customer = await lockCustomer(tx, input.customerId);
  const reward = await tx.reward.findUnique({ where: { id: input.rewardId } });
  if (!reward || !reward.active) throw notFound("Récompense");

  const balance = await getBalance(tx, customer.id);
  if (balance < reward.pointsCost) {
    throw badRequest("INSUFFICIENT_POINTS", `Solde insuffisant : ${balance} points sur ${reward.pointsCost}`);
  }
  if (reward.stock !== null) {
    const dec = await tx.reward.updateMany({ where: { id: reward.id, stock: { gt: 0 } }, data: { stock: { decrement: 1 } } });
    if (dec.count === 0) throw conflict("OUT_OF_STOCK", "Cette récompense n'est plus en stock");
  }

  const t = await tx.pointTransaction.create({
    data: {
      merchantId: ctx.merchantId,
      customerId: customer.id,
      type: "REDEEM",
      points: -reward.pointsCost,
      staffUserId: actorUserId(ctx.actor),
    },
  });
  const redemption = await tx.redemption.create({
    data: {
      merchantId: ctx.merchantId,
      customerId: customer.id,
      rewardId: reward.id,
      staffUserId: actorUserId(ctx.actor),
      pointTransactionId: t.id,
    },
  });
  return { redemptionId: redemption.id, reward: { id: reward.id, name: reward.name }, balance: balance - reward.pointsCost };
}

/** Annulation (erreur de caisse) : mouvement inverse, jamais de suppression. */
export async function cancelRedemption(tx: Tx, ctx: Ctx, redemptionId: string, reason: string) {
  const r = await tx.redemption.findUnique({ where: { id: redemptionId }, include: { pointTransaction: true, reward: true } });
  if (!r) throw notFound("Remise");
  if (r.canceledAt) throw conflict("ALREADY_CANCELED", "Remise déjà annulée");
  await lockCustomer(tx, r.customerId);
  await tx.pointTransaction.create({
    data: {
      merchantId: ctx.merchantId,
      customerId: r.customerId,
      type: "REVERSAL",
      points: -r.pointTransaction.points,
      reason,
      relatedTransactionId: r.pointTransactionId,
      staffUserId: actorUserId(ctx.actor),
    },
  });
  await tx.redemption.update({ where: { id: r.id }, data: { canceledAt: new Date() } });
  if (r.reward.stock !== null) await tx.reward.update({ where: { id: r.rewardId }, data: { stock: { increment: 1 } } });
  await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "redemption.cancel", entityType: "redemption", entityId: r.id, reason });
}
