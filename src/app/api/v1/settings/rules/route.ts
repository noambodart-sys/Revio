import { withTenant } from "@/server/db";
import { OWNER_ONLY, readJson, requireUser, route } from "@/server/http";
import { getStoredRules, rulesPatchSchema, updateRules } from "@/server/services/rules";
import { PLAN_FEATURES } from "@/config/plans";

/** Tout ce dont l'écran « Réglages » a besoin. */
export const GET = route(async (req) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  return withTenant(ctx.merchantId, async (tx) => {
    const m = await tx.merchant.findUniqueOrThrow({ where: { id: ctx.merchantId } });
    return {
      merchant: { name: m.name, plan: m.plan, primaryColor: m.primaryColor, logoUrl: m.logoUrl, subscriptionStatus: m.subscriptionStatus, trialEndsAt: m.trialEndsAt },
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
