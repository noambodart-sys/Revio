import { z } from "zod";
import { isUuid, withTenant } from "@/server/db";
import { readJson, requireUser, route, STAFF_ROLES } from "@/server/http";
import { notFound } from "@/server/errors";
import { cancelRedemption } from "@/server/services/rewards";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { ctx } = await requireUser(req, STAFF_ROLES);
  if (!isUuid(id)) throw notFound("Remise");
  const { reason } = await readJson(req, z.object({ reason: z.string().trim().min(3).max(200) }));
  await withTenant(ctx.merchantId, (tx) => cancelRedemption(tx, ctx, id, reason));
  return { ok: true };
});
