import { z } from "zod";
import { isUuid, withTenant } from "@/server/db";
import { rateLimit, readJson, requireDevice, route } from "@/server/http";
import { AppError, notFound } from "@/server/errors";
import { staffUnlock } from "@/server/services/counter";

/** Mode comptoir : le vendeur saisit son code sur la tablette. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireDevice(req);
  if (!isUuid(id)) throw notFound("Passage");
  rateLimit(`staff-pin:${ctx.actor.type === "DEVICE" ? ctx.actor.deviceId : ""}`, 10, 10 * 60);
  const { pin } = await readJson(req, z.object({ pin: z.string().max(10) }));
  const r = await withTenant(ctx.merchantId, (tx) => staffUnlock(tx, ctx, id, pin));
  if (!r.ok) throw new AppError(401, "STAFF_PIN_INVALID", "Code vendeur incorrect");
  return { token: r.token, staffName: r.staffName };
});
