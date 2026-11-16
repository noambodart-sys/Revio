import { withTenant } from "@/server/db";
import { OWNER_ONLY, readJson, requireUser, route } from "@/server/http";
import { campaignInputSchema, previewCampaign } from "@/server/services/campaigns";

export const POST = route(async (req) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  const input = await readJson(req, campaignInputSchema);
  return withTenant(ctx.merchantId, (tx) => previewCampaign(tx, ctx.merchantId, input));
});
