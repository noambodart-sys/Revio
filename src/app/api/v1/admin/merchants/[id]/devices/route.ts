import { z } from "zod";
import { isUuid, systemDb } from "@/server/db";
import { ADMIN_ONLY, readJson, requireUser, route } from "@/server/http";
import { notFound } from "@/server/errors";
import { createPairingCode } from "@/server/services/devices";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { ctx } = await requireUser(req, ADMIN_ONLY);
  if (!isUuid(id)) throw notFound("Commerce");
  const { name } = await readJson(req, z.object({ name: z.string().trim().min(1).max(60) }));
  return createPairingCode(systemDb(), ctx.actor, id, name);
});
