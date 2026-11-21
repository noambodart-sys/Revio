import { isUuid, withTenant } from "@/server/db";
import { OWNER_ONLY, readJson, requireUser, route } from "@/server/http";
import { notFound } from "@/server/errors";
import { updateMember, updateMemberSchema } from "@/server/services/team";

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  if (!isUuid(id)) throw notFound("Membre");
  const body = await readJson(req, updateMemberSchema);
  await withTenant(ctx.merchantId, (tx) => updateMember(tx, ctx, id, body));
  return { ok: true };
});
