import { z } from "zod";
import { withTenant } from "@/server/db";
import { readJson, requireUser, route, STAFF_ROLES } from "@/server/http";
import { redeemReward } from "@/server/services/rewards";

export const POST = route(async (req) => {
  const { ctx } = await requireUser(req, STAFF_ROLES);
  const body = await readJson(req, z.object({ customerId: z.string().uuid(), rewardId: z.string().uuid() }));
  return withTenant(ctx.merchantId, (tx) => redeemReward(tx, ctx, body));
});
