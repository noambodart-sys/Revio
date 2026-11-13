import { withTenant } from "@/server/db";
import { OWNER_ONLY, readJson, requireUser, route } from "@/server/http";
import { createDataRequest, dataRequestSchema } from "@/server/services/gdpr";

export const GET = route(async (req) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  return withTenant(ctx.merchantId, (tx) => tx.dataRequest.findMany({ orderBy: { requestedAt: "desc" }, take: 200 }));
});

export const POST = route(async (req) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  const body = await readJson(req, dataRequestSchema);
  return withTenant(ctx.merchantId, (tx) => createDataRequest(tx, ctx, body));
});
