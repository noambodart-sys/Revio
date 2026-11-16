import { isUuid, withTenant } from "@/server/db";
import { OWNER_ONLY, requireUser, route } from "@/server/http";
import { notFound } from "@/server/errors";
import { campaignResults } from "@/server/services/campaigns";

export const GET = route<{ id: string }>(async (req, { id }) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  if (!isUuid(id)) throw notFound("Campagne");
  const [c] = await withTenant(ctx.merchantId, (tx) => campaignResults(tx, ctx.merchantId, id));
  if (!c) throw notFound("Campagne");
  return c;
});
