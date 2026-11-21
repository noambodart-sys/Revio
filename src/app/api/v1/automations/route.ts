import { withTenant } from "@/server/db";
import { OWNER_ONLY, requireUser, route } from "@/server/http";
import { listAutomations } from "@/server/services/automations";

export const GET = route(async (req) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  return withTenant(ctx.merchantId, (tx) => listAutomations(tx, ctx.merchantId));
});
