import { withTenant } from "@/server/db";
import { OWNER_ONLY, rateLimit, readJson, requireUser, route } from "@/server/http";
import { campaignInputSchema, campaignResults, sendCampaign } from "@/server/services/campaigns";

export const GET = route(async (req) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  return withTenant(ctx.merchantId, (tx) => campaignResults(tx, ctx.merchantId));
});

export const POST = route(async (req) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  rateLimit(`campaign:${ctx.merchantId}`, 10, 3600);
  const input = await readJson(req, campaignInputSchema);
  return sendCampaign(ctx, input);
});
