import { z } from "zod";
import { withTenant } from "@/server/db";
import { OWNER_ONLY, readJson, requireUser, route } from "@/server/http";
import { bonusPeriodsSchema, replaceBonusPeriods } from "@/server/services/engagement";

export const PUT = route(async (req) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  const { periods } = await readJson(req, z.object({ periods: bonusPeriodsSchema }));
  return withTenant(ctx.merchantId, (tx) => replaceBonusPeriods(tx, ctx, periods));
});
