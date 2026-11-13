import { isUuid, withTenant } from "@/server/db";
import { requireDevice, route } from "@/server/http";
import { notFound } from "@/server/errors";
import { spinWheel } from "@/server/services/wheel";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireDevice(req);
  if (!isUuid(id)) throw notFound("Passage");
  return withTenant(ctx.merchantId, async (tx) => {
    const s = await tx.kioskSession.findUnique({ where: { id } });
    if (!s?.customerId || (ctx.actor.type === "DEVICE" && s.deviceId !== ctx.actor.deviceId)) throw notFound("Passage");
    return spinWheel(tx, ctx, { customerId: s.customerId, kioskSessionId: id });
  });
});
