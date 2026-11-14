import { z } from "zod";
import type { Tx } from "../db";
import type { Ctx } from "../context";
import { badRequest } from "../errors";
import { audit } from "../audit";
import { BUSINESS_TIMEZONE } from "@/config/product";
import { customerSummary, findCustomerByPhone } from "./customers";
import { normalizePhone } from "../phone";

const DAY = 24 * 3600_000;

// ---------------------------------------------------------------------------
// Tableau de bord
// ---------------------------------------------------------------------------

export async function dashboard(tx: Tx, merchantId: string, now = new Date()) {
  const d30 = new Date(now.getTime() - 30 * DAY);
  const d7 = new Date(now.getTime() - 7 * DAY);
  const live = { merchantId, anonymizedAt: null, phoneVerifiedAt: { not: null } } as const;

  const [total, active30, new30, visits7, visits30, earned30, redeemed30, revenue30, outstanding, rewards30] = await Promise.all([
    tx.customer.count({ where: live }),
    tx.customer.count({ where: { ...live, lastVisitAt: { gte: d30 } } }),
    tx.customer.count({ where: { ...live, enrolledAt: { gte: d30 } } }),
    tx.pointTransaction.count({ where: { merchantId, type: "EARN", occurredAt: { gte: d7 } } }),
    tx.pointTransaction.count({ where: { merchantId, type: "EARN", occurredAt: { gte: d30 } } }),
    tx.pointTransaction.aggregate({ where: { merchantId, type: { in: ["EARN", "TIER_BONUS", "WHEEL_BONUS"] }, occurredAt: { gte: d30 } }, _sum: { points: true } }),
    tx.pointTransaction.aggregate({ where: { merchantId, type: "REDEEM", occurredAt: { gte: d30 } }, _sum: { points: true } }),
    tx.pointTransaction.aggregate({ where: { merchantId, type: "EARN", occurredAt: { gte: d30 } }, _sum: { purchaseAmountCents: true } }),
    tx.pointTransaction.aggregate({ where: { merchantId, customer: { anonymizedAt: null } }, _sum: { points: true } }),
    tx.redemption.groupBy({ by: ["rewardId"], where: { merchantId, canceledAt: null, createdAt: { gte: d30 } }, _count: { _all: true } }),
  ]);

  const rewardNames = await tx.reward.findMany({ where: { id: { in: rewards30.map((r) => r.rewardId) } }, select: { id: true, name: true } });
  const topRewards = rewards30
    .map((r) => ({ name: rewardNames.find((n) => n.id === r.rewardId)?.name ?? "—", count: r._count._all }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Passages par jour (30 derniers jours, jours sans passage inclus), en heure locale du commerce
  const rows = await tx.$queryRaw<{ day: string; visits: bigint }[]>`
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day, COUNT(pt.id) AS visits
    FROM generate_series(
      ((now() AT TIME ZONE ${BUSINESS_TIMEZONE})::date - 29),
      (now() AT TIME ZONE ${BUSINESS_TIMEZONE})::date,
      interval '1 day') AS d(day)
    LEFT JOIN point_transactions pt
      ON pt.merchant_id = ${merchantId}::uuid AND pt.type = 'EARN'
     AND (pt.occurred_at AT TIME ZONE 'UTC' AT TIME ZONE ${BUSINESS_TIMEZONE})::date = d.day::date
    GROUP BY d.day ORDER BY d.day`;

  const alerts = await tx.auditLog.findMany({
    where: { merchantId, action: { startsWith: "fraud." }, createdAt: { gte: d30 } },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { actorUser: { select: { displayName: true } } },
  });

  return {
    customers: { total, active30, new30 },
    visits: { last7: visits7, last30: visits30 },
    points: { earned30: earned30._sum.points ?? 0, redeemed30: -(redeemed30._sum.points ?? 0), outstanding: outstanding._sum.points ?? 0 },
    revenue30Cents: revenue30._sum.purchaseAmountCents ?? 0,
    rewards30: rewards30.reduce((s, r) => s + r._count._all, 0),
    topRewards,
    visitsByDay: rows.map((r) => ({ day: r.day, visits: Number(r.visits) })),
    alerts: alerts.map((a) => ({
      id: a.id,
      action: a.action,
      at: a.createdAt,
      by: a.actorUser?.displayName ?? null,
      metadata: a.metadata,
    })),
  };
}

// ---------------------------------------------------------------------------
// Liste des clients
// ---------------------------------------------------------------------------

export const customerListSchema = z.object({
  q: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

const PAGE_SIZE = 25;

/** Liste paginée. Recherche : numéro exact (via l'empreinte) ou début du prénom. */
export async function listCustomers(tx: Tx, merchantId: string, input: z.infer<typeof customerListSchema>) {
  const q = input.q ?? "";
  if (q && /^[+\d][\d\s./-]{5,}$/.test(q)) {
    let e164: string;
    try {
      e164 = normalizePhone(q);
    } catch {
      return { items: [], total: 0, page: 1, pageSize: PAGE_SIZE };
    }
    const c = await findCustomerByPhone(tx, merchantId, e164);
    if (!c || !c.phoneVerifiedAt) return { items: [], total: 0, page: 1, pageSize: PAGE_SIZE };
    const s = await customerSummary(tx, c.id);
    return { items: [toRow(s, await visitCounts(tx, [c.id]))], total: 1, page: 1, pageSize: PAGE_SIZE };
  }

  const where = {
    merchantId,
    anonymizedAt: null,
    phoneVerifiedAt: { not: null },
    ...(q ? { firstName: { startsWith: q, mode: "insensitive" as const } } : {}),
  };
  const [total, customers] = await Promise.all([
    tx.customer.count({ where }),
    tx.customer.findMany({
      where,
      orderBy: [{ lastVisitAt: { sort: "desc", nulls: "last" } }, { enrolledAt: "desc" }],
      skip: (input.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { currentTier: true, identifiers: { where: { type: "PHONE", revokedAt: null }, select: { displayHint: true } } },
    }),
  ]);
  const ids = customers.map((c) => c.id);
  const [balances, visits, marketing] = await Promise.all([
    tx.pointTransaction.groupBy({ by: ["customerId"], where: { customerId: { in: ids } }, _sum: { points: true } }),
    visitCounts(tx, ids),
    marketingSms(tx, ids),
  ]);
  return {
    items: customers.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      maskedPhone: c.identifiers[0]?.displayHint ?? null,
      balance: balances.find((b) => b.customerId === c.id)?._sum.points ?? 0,
      tier: c.currentTier?.name ?? null,
      visits: visits.get(c.id) ?? 0,
      enrolledAt: c.enrolledAt,
      lastVisitAt: c.lastVisitAt,
      marketingSms: marketing.get(c.id) ?? false,
    })),
    total,
    page: input.page,
    pageSize: PAGE_SIZE,
  };
}

function toRow(s: Awaited<ReturnType<typeof customerSummary>>, visits: Map<string, number>) {
  return {
    id: s.id,
    firstName: s.firstName,
    maskedPhone: s.maskedPhone,
    balance: s.balance,
    tier: s.tier?.name ?? null,
    visits: visits.get(s.id) ?? 0,
    enrolledAt: s.enrolledAt,
    lastVisitAt: s.lastVisitAt,
    marketingSms: false,
  };
}

async function visitCounts(tx: Tx, ids: string[]) {
  const rows = await tx.pointTransaction.groupBy({ by: ["customerId"], where: { customerId: { in: ids }, type: "EARN" }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.customerId, r._count._all]));
}

/** Dernier choix marketing SMS de chaque client. */
async function marketingSms(tx: Tx, ids: string[]) {
  const rows = await tx.consent.findMany({
    where: { customerId: { in: ids }, type: "MARKETING_SMS" },
    orderBy: { createdAt: "asc" },
    select: { customerId: true, granted: true },
  });
  const m = new Map<string, boolean>();
  for (const r of rows) m.set(r.customerId, r.granted);
  return m;
}

/**
 * Export CSV de la liste des clients (pour le commerçant, responsable du traitement).
 * Numéros masqués : l'export sert au suivi, pas à contourner les consentements marketing.
 */
export async function exportCustomersCsv(tx: Tx, ctx: Ctx) {
  const all: Awaited<ReturnType<typeof listCustomers>>["items"] = [];
  for (let page = 1; ; page++) {
    const r = await listCustomers(tx, ctx.merchantId, { page });
    all.push(...r.items);
    if (all.length >= r.total || r.items.length === 0) break;
  }
  const esc = (v: unknown) => {
    const s = v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Prénom", "Numéro (masqué)", "Solde (points)", "Niveau", "Passages", "Inscription", "Dernière visite", "Accord SMS"];
  const lines = all.map((c) =>
    [c.firstName, c.maskedPhone, c.balance, c.tier, c.visits, c.enrolledAt, c.lastVisitAt, c.marketingSms ? "oui" : "non"].map(esc).join(";"),
  );
  await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "customers.export_csv", entityType: "customer", metadata: { count: all.length } });
  // BOM UTF-8 + séparateur « ; » : s'ouvre correctement dans Excel en français
  return "﻿" + [header.join(";"), ...lines].join("\r\n");
}

// ---------------------------------------------------------------------------
// Apparence de la tablette
// ---------------------------------------------------------------------------

const MAX_LOGO_BYTES = 200_000;

export const brandingSchema = z
  .object({
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide").nullable(),
    logoUrl: z.string().max(Math.ceil(MAX_LOGO_BYTES * 1.4)).nullable(),
  })
  .partial()
  .strict();

export async function updateBranding(tx: Tx, ctx: Ctx, input: z.infer<typeof brandingSchema>) {
  if (input.logoUrl && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(input.logoUrl)) {
    throw badRequest("INVALID_LOGO", "Logo invalide : image PNG, JPEG ou WebP uniquement");
  }
  const m = await tx.merchant.update({
    where: { id: ctx.merchantId },
    data: input,
    select: { primaryColor: true, logoUrl: true },
  });
  await audit(tx, {
    merchantId: ctx.merchantId,
    actor: ctx.actor,
    action: "merchant.branding",
    entityType: "merchant",
    entityId: ctx.merchantId,
    metadata: { primaryColor: input.primaryColor, logoChanged: input.logoUrl !== undefined },
  });
  return m;
}
