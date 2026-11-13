import { z } from "zod";
import { withTenant } from "@/server/db";
import { rateLimit, readJson, requireDevice, route } from "@/server/http";
import { startKioskSession } from "@/server/services/kiosk";

export const POST = route(async (req) => {
  const ctx = await requireDevice(req);
  rateLimit(`kiosk-start:${ctx.actor.type === "DEVICE" ? ctx.actor.deviceId : ""}`, 30, 60);
  const { phone } = await readJson(req, z.object({ phone: z.string().min(6).max(20) }));
  return withTenant(ctx.merchantId, (tx) => startKioskSession(tx, ctx, phone));
});
