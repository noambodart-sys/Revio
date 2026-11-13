import { z } from "zod";
import { isUuid } from "@/server/db";
import { ADMIN_ONLY, readJson, requireUser, route } from "@/server/http";
import { notFound } from "@/server/errors";
import { createStaffUser } from "@/server/services/merchants";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { ctx } = await requireUser(req, ADMIN_ONLY);
  if (!isUuid(id)) throw notFound("Commerce");
  const body = await readJson(
    req,
    z.object({ email: z.string().email(), displayName: z.string().trim().min(1).max(60), password: z.string().min(12).max(200), role: z.enum(["OWNER", "STAFF"]) }),
  );
  return createStaffUser(ctx.actor, id, body);
});
