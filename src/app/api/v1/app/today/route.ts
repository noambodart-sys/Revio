import { withTenant } from "@/server/db";
import { OWNER_ONLY, requireUser, route } from "@/server/http";
import { suggestions, todayStats } from "@/server/services/today";
import { happyHourStatus } from "@/server/services/engagement";

export const GET = route(async (req) => {
  const { ctx, user } = await requireUser(req, OWNER_ONLY);
  return withTenant(ctx.merchantId, async (tx) => ({
    merchantName: user.merchantName,
    firstName: user.displayName.split(" ")[0],
    stats: await todayStats(tx, ctx.merchantId),
    happyHour: await happyHourStatus(tx, ctx.merchantId),
    suggestions: await suggestions(tx, ctx.merchantId),
  }));
});
