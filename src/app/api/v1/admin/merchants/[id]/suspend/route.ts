import { z } from "zod";
import { isUuid } from "@/server/db";
import { ADMIN_ONLY, readJson, requireUser, route } from "@/server/http";
import { notFound } from "@/server/errors";
import { setMerchantSuspended } from "@/server/services/merchants";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { ctx } = await requireUser(req, ADMIN_ONLY);
  if (!isUuid(id)) throw notFound("Commerce");
  const body = await readJson(req, z.object({ suspended: z.boolean(), reason: z.string().max(200).nullish() }));
  await setMerchantSuspended(ctx.actor, id, body.suspended, body.reason ?? undefined);
  return { ok: true };
});
