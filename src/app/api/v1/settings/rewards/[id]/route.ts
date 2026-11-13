import { isUuid, withTenant } from "@/server/db";
import { OWNER_ONLY, readJson, requireUser, route } from "@/server/http";
import { notFound } from "@/server/errors";
import { rewardSchema, updateReward } from "@/server/services/rewards";

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  if (!isUuid(id)) throw notFound("Récompense");
  const body = await readJson(req, rewardSchema.partial());
  return withTenant(ctx.merchantId, (tx) => updateReward(tx, ctx, id, body));
});
