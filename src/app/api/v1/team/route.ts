import { withTenant } from "@/server/db";
import { OWNER_ONLY, readJson, requireUser, route } from "@/server/http";
import { addMember, listTeam, memberSchema } from "@/server/services/team";

export const GET = route(async (req) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  return withTenant(ctx.merchantId, (tx) => listTeam(tx, ctx.merchantId));
});

export const POST = route(async (req) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  const body = await readJson(req, memberSchema);
  return withTenant(ctx.merchantId, (tx) => addMember(tx, ctx, body));
});
