import { z } from "zod";
import { isUuid, withTenant } from "@/server/db";
import { readJson, requireDevice, route } from "@/server/http";
import { notFound } from "@/server/errors";
import { kioskPreferences, setKioskMarketing } from "@/server/services/kiosk";

export const GET = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireDevice(req);
  if (!isUuid(id)) throw notFound("Passage");
  return withTenant(ctx.merchantId, (tx) => kioskPreferences(tx, ctx, id));
});

export const POST = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireDevice(req);
  if (!isUuid(id)) throw notFound("Passage");
  const { marketingSms } = await readJson(req, z.object({ marketingSms: z.boolean() }));
  return withTenant(ctx.merchantId, (tx) => setKioskMarketing(tx, ctx, id, marketingSms));
});
