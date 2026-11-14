import { z } from "zod";
import type { Rules } from "@prisma/client";
import type { Tx } from "../db";
import type { Ctx } from "../context";
import { AppError } from "../errors";
import { audit } from "../audit";
import { PLAN_FEATURES } from "@/config/plans";

/** Valeurs proposées à la création d'un commerce ; ensuite tout est réglable. */
export const DEFAULT_TIERS = [
  { name: "Bronze", rank: 0, minPoints: 0, bonusPercent: 0 },
  { name: "Argent", rank: 1, minPoints: 300, bonusPercent: 5 },
  { name: "Or", rank: 2, minPoints: 1000, bonusPercent: 10 },
];

/** Règles telles que réglées par le commerçant (sans tenir compte de l'offre). */
export async function getStoredRules(tx: Tx, merchantId: string): Promise<Rules> {
  const r = await tx.rules.findUnique({ where: { merchantId } });
  if (!r) throw new AppError(500, "RULES_MISSING", "Règles du commerce non configurées");
  return r;
}

/**
 * Règles effectives : la roue et les niveaux ne s'appliquent que si l'offre les inclut.
 * C'est la version que toute la logique métier doit utiliser.
 */
export async function getRules(tx: Tx, merchantId: string): Promise<Rules> {
  const r = await getStoredRules(tx, merchantId);
  const m = await tx.merchant.findUnique({ where: { id: merchantId }, select: { plan: true } });
  const f = PLAN_FEATURES[m?.plan ?? "ESSENTIEL"];
  return { ...r, wheelEnabled: r.wheelEnabled && f.wheel, tiersEnabled: r.tiersEnabled && f.tiers };
}

/** Crée les règles (valeurs par défaut de la base) et les niveaux par défaut. */
export async function initMerchantDefaults(tx: Tx, merchantId: string) {
  await tx.rules.create({ data: { merchantId } });
  await tx.tierLevel.createMany({ data: DEFAULT_TIERS.map((t) => ({ ...t, merchantId })) });
}

export const rulesPatchSchema = z
  .object({
    earnMode: z.enum(["PER_EURO", "PER_VISIT"]),
    pointsPerEuro: z.number().min(0).max(1000).multipleOf(0.01),
    pointsPerVisit: z.number().int().min(0).max(100_000),
    minPurchaseCents: z.number().int().min(0),
    identificationMode: z.enum(["PIN", "STAFF_VALIDATION"]),
    pinMaxAttempts: z.number().int().min(3).max(10),
    pointsExpiryMonths: z.number().int().min(1).max(60),
    expiryReminderDays: z.number().int().min(0).max(90),
    inactivityRetentionMonths: z.number().int().min(1).max(36),
    tiersEnabled: z.boolean(),
    tierWindowMonths: z.number().int().min(1).max(36),
    wheelEnabled: z.boolean(),
    dailyPointsCap: z.number().int().positive().nullable(),
    adjustmentAlertDailyCount: z.number().int().positive(),
    kioskResetSeconds: z.number().int().min(5).max(120),
  })
  .partial()
  .strict();

export async function updateRules(tx: Tx, ctx: Ctx, patch: z.infer<typeof rulesPatchSchema>) {
  const before = await getStoredRules(tx, ctx.merchantId);
  const updated = await tx.rules.update({
    where: { merchantId: ctx.merchantId },
    data: { ...patch, updatedById: ctx.actor.type === "USER" ? ctx.actor.userId : null },
  });
  await audit(tx, {
    merchantId: ctx.merchantId,
    actor: ctx.actor,
    action: "rules.update",
    entityType: "rules",
    entityId: ctx.merchantId,
    metadata: { before: JSON.parse(JSON.stringify(before)), patch },
  });
  return updated;
}

export const tiersSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(40),
      minPoints: z.number().int().min(0),
      bonusPercent: z.number().int().min(0).max(100),
    }),
  )
  .min(1)
  .max(6)
  .refine((t) => t[0].minPoints === 0, "Le premier niveau doit commencer à 0 point")
  .refine((t) => t.every((x, i) => i === 0 || x.minPoints > t[i - 1].minPoints), "Les seuils doivent être croissants");

/** Remplace la grille des niveaux (les clients sont recalculés à leur prochain passage). */
export async function replaceTiers(tx: Tx, ctx: Ctx, tiers: z.infer<typeof tiersSchema>) {
  await tx.customer.updateMany({ where: { merchantId: ctx.merchantId }, data: { currentTierId: null } });
  await tx.tierLevel.deleteMany({ where: { merchantId: ctx.merchantId } });
  await tx.tierLevel.createMany({ data: tiers.map((t, rank) => ({ ...t, rank, merchantId: ctx.merchantId })) });
  await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "tiers.replace", entityType: "tier_levels", metadata: tiers });
  return tx.tierLevel.findMany({ where: { merchantId: ctx.merchantId }, orderBy: { rank: "asc" } });
}
