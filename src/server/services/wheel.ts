import { randomInt } from "node:crypto";
import { z } from "zod";
import type { WheelPrize } from "@prisma/client";
import type { Tx } from "../db";
import type { Ctx } from "../context";
import { badRequest, conflict } from "../errors";
import { audit } from "../audit";
import { businessDateValue } from "../time";
import { getRules } from "./rules";
import { getBalance, lockCustomer } from "./points";

/** Tirage pondéré. `roll` ∈ [0, somme des poids[ — injecté pour les tests. */
export function pickPrize<T extends Pick<WheelPrize, "weight">>(prizes: T[], roll?: number): T {
  const total = prizes.reduce((s, p) => s + p.weight, 0);
  if (prizes.length === 0 || total <= 0) throw new Error("Roue vide");
  let r = roll ?? randomInt(0, total);
  for (const p of prizes) {
    if (r < p.weight) return p;
    r -= p.weight;
  }
  return prizes[prizes.length - 1];
}

export async function hasSpunToday(tx: Tx, merchantId: string, customerId: string) {
  const s = await tx.wheelSpin.findUnique({
    where: { merchantId_customerId_spinDate: { merchantId, customerId, spinDate: businessDateValue() } },
  });
  return s;
}

/**
 * Tirage côté serveur, uniquement après un achat validé dans ce passage,
 * une fois par jour et par client (garanti par une contrainte d'unicité).
 */
export async function spinWheel(tx: Tx, ctx: Ctx, input: { customerId: string; kioskSessionId: string }) {
  const rules = await getRules(tx, ctx.merchantId);
  if (!rules.wheelEnabled) throw badRequest("WHEEL_DISABLED", "La roue n'est pas activée");
  const session = await tx.kioskSession.findUnique({ where: { id: input.kioskSessionId } });
  if (!session || session.customerId !== input.customerId || session.status !== "COMPLETED") {
    throw badRequest("WHEEL_NOT_ALLOWED", "La roue est disponible après un achat");
  }
  await lockCustomer(tx, input.customerId);
  if (await hasSpunToday(tx, ctx.merchantId, input.customerId)) {
    throw conflict("WHEEL_ALREADY_SPUN", "Vous avez déjà tourné la roue aujourd'hui");
  }
  const prizes = await tx.wheelPrize.findMany({ where: { merchantId: ctx.merchantId, active: true }, orderBy: { sortOrder: "asc" } });
  if (prizes.length === 0) throw badRequest("WHEEL_EMPTY", "Aucun lot configuré");

  const prize = pickPrize(prizes);
  let pointTransactionId: string | null = null;
  if (prize.type === "POINTS" && prize.points) {
    const t = await tx.pointTransaction.create({
      data: {
        merchantId: ctx.merchantId,
        customerId: input.customerId,
        type: "WHEEL_BONUS",
        points: prize.points,
        kioskSessionId: input.kioskSessionId,
        deviceId: ctx.actor.type === "DEVICE" ? ctx.actor.deviceId : null,
      },
    });
    pointTransactionId = t.id;
  }
  const spin = await tx.wheelSpin.create({
    data: {
      merchantId: ctx.merchantId,
      customerId: input.customerId,
      spinDate: businessDateValue(),
      prizeId: prize.id,
      prizeLabel: prize.label,
      pointTransactionId,
    },
  });
  return {
    spinId: spin.id,
    prize: { id: prize.id, label: prize.label, type: prize.type, points: prize.points },
    prizeIndex: prizes.findIndex((p) => p.id === prize.id),
    balance: await getBalance(tx, input.customerId),
  };
}

export const wheelPrizesSchema = z
  .array(
    z.object({
      label: z.string().trim().min(1).max(40),
      type: z.enum(["NOTHING", "POINTS", "REWARD"]),
      points: z.number().int().positive().nullish(),
      rewardId: z.string().uuid().nullish(),
      weight: z.number().int().positive().max(10_000),
    }),
  )
  .min(2)
  .max(12);

export async function replaceWheelPrizes(tx: Tx, ctx: Ctx, prizes: z.infer<typeof wheelPrizesSchema>) {
  await tx.wheelPrize.updateMany({ where: { merchantId: ctx.merchantId }, data: { active: false } });
  await tx.wheelPrize.createMany({
    data: prizes.map((p, i) => ({ ...p, points: p.points ?? null, rewardId: p.rewardId ?? null, sortOrder: i, merchantId: ctx.merchantId })),
  });
  await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "wheel.replace", entityType: "wheel_prizes", metadata: prizes });
  return tx.wheelPrize.findMany({ where: { merchantId: ctx.merchantId, active: true }, orderBy: { sortOrder: "asc" } });
}
