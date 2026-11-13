import { withTenant } from "@/server/db";
import { OWNER_ONLY, readJson, requireUser, route } from "@/server/http";
import { getRules, rulesPatchSchema, updateRules } from "@/server/services/rules";

export const GET = route(async (req) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  return withTenant(ctx.merchantId, async (tx) => ({
    rules: await getRules(tx, ctx.merchantId),
    tiers: await tx.tierLevel.findMany({ orderBy: { rank: "asc" } }),
    wheelPrizes: await tx.wheelPrize.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  }));
});

export const PATCH = route(async (req) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  const body = await readJson(req, rulesPatchSchema);
  return withTenant(ctx.merchantId, (tx) => updateRules(tx, ctx, body));
});
