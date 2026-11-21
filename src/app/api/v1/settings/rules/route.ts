import { withTenant } from "@/server/db";
import { OWNER_ONLY, readJson, requireUser, route } from "@/server/http";
import { getStoredRules, rulesPatchSchema, updateRules } from "@/server/services/rules";
import { PLAN_FEATURES } from "@/config/plans";
import { BUSINESS_TEMPLATES } from "@/config/templates";
import { listBonusPeriods } from "@/server/services/engagement";

/** Tout ce dont l'écran « Réglages » a besoin. */
export const GET = route(async (req) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  return withTenant(ctx.merchantId, async (tx) => {
    const m = await tx.merchant.findUniqueOrThrow({ where: { id: ctx.merchantId } });
    return {
      merchant: {
        name: m.name, plan: m.plan, primaryColor: m.primaryColor, logoUrl: m.logoUrl, kioskMessage: m.kioskMessage,
        kioskTitle: m.kioskTitle, kioskTheme: m.kioskTheme, kioskBackground: m.kioskBackground,
        businessType: m.businessType, subscriptionStatus: m.subscriptionStatus, trialEndsAt: m.trialEndsAt,
      },
      bonusPeriods: await listBonusPeriods(tx, ctx.merchantId),
      templates: BUSINESS_TEMPLATES.map((t) => ({ key: t.key, label: t.label, emoji: t.emoji, pitch: t.pitch })),
      counts: { rewards: await tx.reward.count({ where: { active: true } }), customers: await tx.customer.count() },
      features: PLAN_FEATURES[m.plan],
      rules: await getStoredRules(tx, ctx.merchantId),
      tiers: await tx.tierLevel.findMany({ orderBy: { rank: "asc" } }),
      wheelPrizes: await tx.wheelPrize.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    };
  });
});

export const PATCH = route(async (req) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  const body = await readJson(req, rulesPatchSchema);
  return withTenant(ctx.merchantId, (tx) => updateRules(tx, ctx, body));
});
