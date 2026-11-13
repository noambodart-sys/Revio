import { z } from "zod";
import { isUuid, withTenant } from "@/server/db";
import { readJson, requireUser, route, STAFF_ROLES } from "@/server/http";
import { notFound } from "@/server/errors";
import { adjustPoints } from "@/server/services/points";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { ctx } = await requireUser(req, STAFF_ROLES);
  if (!isUuid(id)) throw notFound("Client");
  const body = await readJson(req, z.object({ points: z.number().int(), reason: z.string().max(200) }));
  return withTenant(ctx.merchantId, (tx) => adjustPoints(tx, ctx, { customerId: id, ...body }));
});
