import { isUuid, systemDb } from "@/server/db";
import { ADMIN_ONLY, requireUser, route } from "@/server/http";
import { notFound } from "@/server/errors";
import { revokeDevice } from "@/server/services/devices";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { ctx } = await requireUser(req, ADMIN_ONLY);
  if (!isUuid(id)) throw notFound("Tablette");
  await revokeDevice(systemDb(), ctx.actor, id);
  return { ok: true };
});
