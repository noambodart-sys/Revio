import { withTenant } from "@/server/db";
import { OWNER_ONLY, requireUser, route } from "@/server/http";
import { notFound } from "@/server/errors";
import { isSegmentKey, segmentMembers } from "@/server/services/segments";

/** Clients d'un groupe : numéros toujours masqués. */
export const GET = route<{ key: string }>(async (req, { key }) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  if (!isSegmentKey(key)) throw notFound("Groupe");
  const members = await withTenant(ctx.merchantId, (tx) => segmentMembers(tx, ctx.merchantId, key));
  return members
    .sort((a, b) => (b.lastVisitAt?.getTime() ?? 0) - (a.lastVisitAt?.getTime() ?? 0))
    .map((m) => ({
      id: m.id,
      firstName: m.firstName,
      maskedPhone: m.maskedPhone,
      lastVisitAt: m.lastVisitAt,
      visits: m.visits,
      balance: m.balance,
      marketingSms: m.marketingSms,
    }));
});
