import type { Tx } from "../db";
import type { Ctx } from "../context";
import { badRequest } from "../errors";
import { audit } from "../audit";
import { templateByKey } from "@/config/templates";
import { enableRecommendedAutomations } from "./automations";

/**
 * Applique un modèle de métier : règles, niveaux, récompenses, roue, heures creuses, couleur,
 * message du jour. Les récompenses existantes sont masquées (jamais supprimées : historique).
 */
export async function applyTemplate(tx: Tx, ctx: Ctx, key: string) {
  const t = templateByKey(key);
  if (!t) throw badRequest("UNKNOWN_TEMPLATE", "Modèle inconnu");
  const merchantId = ctx.merchantId;

  await tx.rules.update({ where: { merchantId }, data: t.rules });

  await tx.customer.updateMany({ where: { merchantId }, data: { currentTierId: null } });
  await tx.tierLevel.deleteMany({ where: { merchantId } });
  await tx.tierLevel.createMany({ data: t.tiers.map((x, rank) => ({ ...x, rank, merchantId })) });

  await tx.reward.updateMany({ where: { merchantId, active: true }, data: { active: false } });
  const rewards: { id: string }[] = [];
  for (const [i, r] of t.rewards.entries()) {
    rewards.push(await tx.reward.create({ data: { ...r, sortOrder: i, merchantId } }));
  }

  await tx.wheelPrize.updateMany({ where: { merchantId }, data: { active: false } });
  await tx.wheelPrize.createMany({
    data: t.wheel.map((w, i) => ({
      merchantId,
      label: w.label,
      type: w.type,
      points: w.type === "POINTS" ? (w.points ?? null) : null,
      rewardId: w.type === "REWARD" && w.reward !== undefined ? rewards[w.reward].id : null,
      weight: w.weight,
      sortOrder: i,
    })),
  });

  await tx.bonusPeriod.deleteMany({ where: { merchantId } });
  await tx.bonusPeriod.createMany({ data: t.bonusPeriods.map((p) => ({ ...p, merchantId })) });

  const m = await tx.merchant.findUniqueOrThrow({ where: { id: merchantId }, select: { primaryColor: true } });
  await tx.merchant.update({
    where: { id: merchantId },
    data: { businessType: t.key, kioskMessage: t.kioskMessage, primaryColor: m.primaryColor ?? t.color },
  });

  await enableRecommendedAutomations(tx, ctx);
  await audit(tx, { merchantId, actor: ctx.actor, action: "merchant.apply_template", entityType: "merchant", entityId: merchantId, metadata: { template: key } });
  return { applied: t.key };
}
