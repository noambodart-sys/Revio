import { isUuid, withTenant } from "@/server/db";
import { requireUser, route, STAFF_ROLES } from "@/server/http";
import { notFound } from "@/server/errors";
import { redeemOffer } from "@/server/services/campaigns";

/** Le vendeur applique l'offre reçue par SMS. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { ctx } = await requireUser(req, STAFF_ROLES);
  if (!isUuid(id)) throw notFound("Offre");
  return withTenant(ctx.merchantId, (tx) => redeemOffer(tx, ctx, id));
});
