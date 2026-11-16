import { withTenant } from "@/server/db";
import { OWNER_ONLY, requireUser, route } from "@/server/http";
import { listSegments } from "@/server/services/segments";

export const GET = route(async (req) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  return withTenant(ctx.merchantId, (tx) => listSegments(tx, ctx.merchantId));
});
