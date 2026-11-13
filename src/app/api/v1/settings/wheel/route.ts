import { z } from "zod";
import { withTenant } from "@/server/db";
import { OWNER_ONLY, readJson, requireUser, route } from "@/server/http";
import { replaceWheelPrizes, wheelPrizesSchema } from "@/server/services/wheel";

export const PUT = route(async (req) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  const { prizes } = await readJson(req, z.object({ prizes: wheelPrizesSchema }));
  return withTenant(ctx.merchantId, (tx) => replaceWheelPrizes(tx, ctx, prizes));
});
