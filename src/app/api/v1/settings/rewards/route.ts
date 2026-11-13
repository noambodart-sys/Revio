import { withTenant } from "@/server/db";
import { OWNER_ONLY, readJson, requireUser, route } from "@/server/http";
import { createReward, listRewards, rewardSchema } from "@/server/services/rewards";

export const GET = route(async (req) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  return withTenant(ctx.merchantId, (tx) => listRewards(tx, ctx.merchantId, false));
});

export const POST = route(async (req) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  const body = await readJson(req, rewardSchema);
  return withTenant(ctx.merchantId, (tx) => createReward(tx, ctx, body));
});
