import { z } from "zod";
import { isUuid, withTenant } from "@/server/db";
import { OWNER_ONLY, readJson, requireUser, route } from "@/server/http";
import { notFound } from "@/server/errors";
import { eraseCustomer, updateDataRequest } from "@/server/services/gdpr";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  if (!isUuid(id)) throw notFound("Client");
  const body = await readJson(req, z.object({ reason: z.string().trim().min(3).max(200), dataRequestId: z.string().uuid().nullish() }));
  await withTenant(ctx.merchantId, async (tx) => {
    await eraseCustomer(tx, ctx, id, body.reason);
    if (body.dataRequestId) await updateDataRequest(tx, ctx, body.dataRequestId, "CLOSED");
  });
  return { ok: true };
});
