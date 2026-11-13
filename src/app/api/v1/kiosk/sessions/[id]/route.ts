import { withTenant } from "@/server/db";
import { requireDevice, route } from "@/server/http";
import { cancelKioskSession, kioskSessionView } from "@/server/services/kiosk";
import { notFound } from "@/server/errors";
import { isUuid } from "@/server/db";

type P = { id: string };

export const GET = route<P>(async (req, { id }) => {
  const ctx = await requireDevice(req);
  if (!isUuid(id)) throw notFound("Passage");
  return withTenant(ctx.merchantId, (tx) => kioskSessionView(tx, ctx, id));
});

export const DELETE = route<P>(async (req, { id }) => {
  const ctx = await requireDevice(req);
  if (!isUuid(id)) throw notFound("Passage");
  await withTenant(ctx.merchantId, (tx) => cancelKioskSession(tx, ctx, id));
  return { ok: true };
});
