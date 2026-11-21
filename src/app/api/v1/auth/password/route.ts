import { z } from "zod";
import { readJson, requireUser, route } from "@/server/http";
import { changeOwnPassword } from "@/server/services/team";

export const POST = route(async (req) => {
  const { ctx } = await requireUser(req, ["OWNER", "STAFF", "REVIO_ADMIN"]);
  const b = await readJson(req, z.object({ current: z.string().max(200), next: z.string().max(200) }));
  await changeOwnPassword(ctx, b.current, b.next);
  return { ok: true };
});
