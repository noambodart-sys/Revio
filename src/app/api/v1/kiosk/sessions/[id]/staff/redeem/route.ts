import { z } from "zod";
import { isUuid, withTenant } from "@/server/db";
import { readJson, requireDevice, route } from "@/server/http";
import { notFound } from "@/server/errors";
import { counterRedeem } from "@/server/services/counter";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireDevice(req);
  if (!isUuid(id)) throw notFound("Passage");
  const b = await readJson(req, z.object({ token: z.string().max(300), rewardId: z.string().uuid() }));
  return withTenant(ctx.merchantId, (tx) => counterRedeem(tx, ctx, id, b.token, b.rewardId));
});
