import { withTenant } from "@/server/db";
import { requireUser, route, STAFF_ROLES } from "@/server/http";
import { activeKioskSessions } from "@/server/services/kiosk";

/** Clients qui viennent de s'identifier sur une tablette du magasin. */
export const GET = route(async (req) => {
  const { ctx } = await requireUser(req, STAFF_ROLES);
  return withTenant(ctx.merchantId, (tx) => activeKioskSessions(tx, ctx.merchantId));
});
