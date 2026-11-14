import { withTenant } from "@/server/db";
import { OWNER_ONLY, requireUser, route } from "@/server/http";
import { AppError } from "@/server/errors";
import { customersToWinBack, dashboard, impact } from "@/server/services/backoffice";
import { PLAN_FEATURES } from "@/config/plans";

export const GET = route(async (req) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  return withTenant(ctx.merchantId, async (tx) => {
    const m = await tx.merchant.findUniqueOrThrow({ where: { id: ctx.merchantId }, select: { plan: true } });
    if (!PLAN_FEATURES[m.plan].dashboard) throw new AppError(403, "PLAN_REQUIRED", "Le tableau de bord est inclus dans l'offre Pro");
    const [d, i, w] = [await dashboard(tx, ctx.merchantId), await impact(tx, ctx.merchantId), await customersToWinBack(tx, ctx.merchantId)];
    return { ...d, impact: i, winBack: w };
  });
});
