import { withTenant } from "@/server/db";
import { OWNER_ONLY, readJson, requireUser, route } from "@/server/http";
import { brandingSchema, updateBranding } from "@/server/services/backoffice";

export const PATCH = route(async (req) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  const body = await readJson(req, brandingSchema);
  return withTenant(ctx.merchantId, (tx) => updateBranding(tx, ctx, body));
});
