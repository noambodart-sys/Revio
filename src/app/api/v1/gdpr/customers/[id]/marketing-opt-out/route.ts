import { isUuid, withTenant } from "@/server/db";
import { requireUser, route, STAFF_ROLES } from "@/server/http";
import { notFound } from "@/server/errors";
import { optOutMarketing } from "@/server/services/gdpr";

/** Retrait du consentement marketing : le vendeur peut le faire sur simple demande. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { ctx } = await requireUser(req, STAFF_ROLES);
  if (!isUuid(id)) throw notFound("Client");
  return withTenant(ctx.merchantId, (tx) => optOutMarketing(tx, ctx, id));
});
