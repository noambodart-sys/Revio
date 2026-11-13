import { z } from "zod";
import { isUuid, withTenant } from "@/server/db";
import { readJson, requireDevice, route } from "@/server/http";
import { AppError, notFound } from "@/server/errors";
import { submitKioskPin } from "@/server/services/kiosk";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireDevice(req);
  if (!isUuid(id)) throw notFound("Passage");
  const { pin } = await readJson(req, z.object({ pin: z.string().max(10) }));
  const r = await withTenant(ctx.merchantId, (tx) => submitKioskPin(tx, ctx, id, pin));
  if (!r.ok) {
    throw r.locked
      ? new AppError(423, "PIN_LOCKED", "Trop d'essais. Le vendeur va confirmer votre identité.")
      : new AppError(401, "PIN_INVALID", `Code incorrect. Encore ${r.remaining} essai(s).`, { remaining: r.remaining });
  }
  return { ok: true };
});
