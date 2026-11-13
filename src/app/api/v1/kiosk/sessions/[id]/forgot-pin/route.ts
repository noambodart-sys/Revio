import { isUuid, withTenant } from "@/server/db";
import { requireDevice, route } from "@/server/http";
import { notFound } from "@/server/errors";
import { requestPinReset } from "@/server/services/kiosk";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireDevice(req);
  if (!isUuid(id)) throw notFound("Passage");
  await withTenant(ctx.merchantId, (tx) => requestPinReset(tx, ctx, id));
  return { ok: true };
});
