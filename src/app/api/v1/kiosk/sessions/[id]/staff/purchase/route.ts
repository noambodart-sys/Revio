import { z } from "zod";
import { isUuid, withTenant } from "@/server/db";
import { readJson, requireDevice, route } from "@/server/http";
import { notFound } from "@/server/errors";
import { counterPurchase } from "@/server/services/counter";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireDevice(req);
  if (!isUuid(id)) throw notFound("Passage");
  const b = await readJson(req, z.object({ token: z.string().max(300), amountCents: z.number().int().min(0).max(1_000_000), idempotencyKey: z.string().min(8).max(80).nullish() }));
  return withTenant(ctx.merchantId, (tx) => counterPurchase(tx, ctx, id, b.token, b.amountCents, b.idempotencyKey));
});
