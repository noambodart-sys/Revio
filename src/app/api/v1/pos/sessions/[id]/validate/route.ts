import { isUuid, withTenant } from "@/server/db";
import { requireUser, route, STAFF_ROLES } from "@/server/http";
import { notFound } from "@/server/errors";
import { staffValidateSession } from "@/server/services/kiosk";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { ctx } = await requireUser(req, STAFF_ROLES);
  if (!isUuid(id)) throw notFound("Passage");
  await withTenant(ctx.merchantId, (tx) => staffValidateSession(tx, ctx, id));
  return { ok: true };
});
