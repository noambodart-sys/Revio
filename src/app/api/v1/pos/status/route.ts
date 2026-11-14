import { withTenant } from "@/server/db";
import { requireUser, route, STAFF_ROLES } from "@/server/http";
import { happyHourStatus } from "@/server/services/engagement";

/** État affiché en haut de la caisse (heures creuses en cours). */
export const GET = route(async (req) => {
  const { ctx } = await requireUser(req, STAFF_ROLES);
  return withTenant(ctx.merchantId, async (tx) => ({ happyHour: await happyHourStatus(tx, ctx.merchantId) }));
});
