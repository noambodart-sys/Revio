import { withTenant } from "@/server/db";
import { requireUser, route, STAFF_ROLES } from "@/server/http";
import { listRewards } from "@/server/services/rewards";

export const GET = route(async (req) => {
  const { ctx } = await requireUser(req, STAFF_ROLES);
  return withTenant(ctx.merchantId, (tx) => listRewards(tx, ctx.merchantId));
});
