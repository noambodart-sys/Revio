import { z } from "zod";
import { isUuid, withTenant } from "@/server/db";
import { readJson, requireDevice, route } from "@/server/http";
import { AppError, notFound } from "@/server/errors";
import { verifyKioskCode } from "@/server/services/kiosk";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireDevice(req);
  if (!isUuid(id)) throw notFound("Passage");
  const body = await readJson(req, z.object({ code: z.string().max(10), pin: z.string().max(10).nullish() }));
  const r = await withTenant(ctx.merchantId, (tx) => verifyKioskCode(tx, ctx, id, body.code, body.pin));
  if (!r.ok) {
    throw r.reason === "EXPIRED"
      ? new AppError(410, "CODE_EXPIRED", "Code expiré ou trop d'essais. Demandez un nouveau code.")
      : new AppError(401, "CODE_INVALID", "Code incorrect", { remaining: r.remaining });
  }
  return { ok: true };
});
