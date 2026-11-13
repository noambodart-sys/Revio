import { z } from "zod";
import { isUuid, withTenant } from "@/server/db";
import { OWNER_ONLY, readJson, requireUser, route } from "@/server/http";
import { notFound } from "@/server/errors";
import { updateDataRequest } from "@/server/services/gdpr";

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  if (!isUuid(id)) throw notFound("Demande");
  const body = await readJson(req, z.object({ status: z.enum(["OPEN", "IN_PROGRESS", "CLOSED", "REJECTED"]), notes: z.string().max(1000).nullish() }));
  return withTenant(ctx.merchantId, (tx) => updateDataRequest(tx, ctx, id, body.status, body.notes));
});
