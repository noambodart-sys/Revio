import { isUuid, withTenant } from "@/server/db";
import { requireUser, route, STAFF_ROLES, OWNER_ONLY, readJson } from "@/server/http";
import { notFound } from "@/server/errors";
import { customerSummary } from "@/server/services/customers";
import { currentConsents } from "@/server/services/consents";
import { rectifyCustomer, rectifySchema } from "@/server/services/gdpr";
import { hasSpunToday } from "@/server/services/wheel";

type P = { id: string };

/** Fiche client : résumé + derniers mouvements. */
export const GET = route<P>(async (req, { id }) => {
  const { ctx } = await requireUser(req, STAFF_ROLES);
  if (!isUuid(id)) throw notFound("Client");
  return withTenant(ctx.merchantId, async (tx) => {
    const summary = await customerSummary(tx, id);
    const history = await tx.pointTransaction.findMany({
      where: { customerId: id },
      orderBy: { occurredAt: "desc" },
      take: 30,
      include: { staffUser: { select: { displayName: true } } },
    });
    const redemptions = await tx.redemption.findMany({
      where: { customerId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { reward: { select: { name: true } } },
    });
    const spin = await hasSpunToday(tx, ctx.merchantId, id);
    const prize = spin?.prizeId ? await tx.wheelPrize.findUnique({ where: { id: spin.prizeId } }) : null;
    return {
      ...summary,
      wheelToday: spin ? { label: spin.prizeLabel, isReward: prize?.type === "REWARD" } : null,
      consents: await currentConsents(tx, id),
      history: history.map((t) => ({
        id: t.id,
        type: t.type,
        points: t.points,
        purchaseAmountCents: t.purchaseAmountCents,
        reason: t.reason,
        occurredAt: t.occurredAt,
        staff: t.staffUser?.displayName ?? null,
      })),
      redemptions: redemptions.map((r) => ({ id: r.id, reward: r.reward.name, createdAt: r.createdAt, canceledAt: r.canceledAt })),
    };
  });
});

/** Rectification (propriétaire). */
export const PATCH = route<P>(async (req, { id }) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  if (!isUuid(id)) throw notFound("Client");
  const body = await readJson(req, rectifySchema);
  return withTenant(ctx.merchantId, (tx) => rectifyCustomer(tx, ctx, id, body));
});
