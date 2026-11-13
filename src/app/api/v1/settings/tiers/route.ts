import { z } from "zod";
import { withTenant } from "@/server/db";
import { OWNER_ONLY, readJson, requireUser, route } from "@/server/http";
import { replaceTiers, tiersSchema } from "@/server/services/rules";

export const PUT = route(async (req) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  const { tiers } = await readJson(req, z.object({ tiers: tiersSchema }));
  return withTenant(ctx.merchantId, (tx) => replaceTiers(tx, ctx, tiers));
});
