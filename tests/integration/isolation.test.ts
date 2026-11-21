/**
 * Isolation multi-tenant : un commerce ne peut ni lire, ni modifier, ni créer
 * des données d'un autre commerce — même si le code applicatif se trompe.
 * Ces tests attaquent directement la base avec le rôle revio_app.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { disconnectAll, systemDb, withTenant } from "@/server/db";
import { enrollCustomer } from "@/server/services/customers";
import { recordPurchase } from "@/server/services/points";
import { redeemReward } from "@/server/services/rewards";
import { startKioskSession } from "@/server/services/kiosk";
import { createDataRequest } from "@/server/services/gdpr";
import { audit } from "@/server/audit";
import { captureSms, makeMerchant, resetDb } from "../helpers";

type M = Awaited<ReturnType<typeof makeMerchant>>;
let A: M, B: M;
let customerB: string;

// Toutes les tables qui portent merchant_id
const TENANT_TABLES = [
  "users", "devices", "customers", "customer_identifiers", "phone_verifications", "consents", "rules",
  "tier_levels", "rewards", "redemptions", "wheel_prizes", "wheel_spins", "point_transactions",
  "kiosk_sessions", "audit_log", "data_requests", "bonus_periods", "campaigns", "campaign_recipients", "automations",
];

async function populate(m: M, phone: string) {
  return m.tenant(async (tx) => {
    const c = await enrollCustomer(tx, m.deviceCtx, { phone, firstName: "Test", acceptTerms: true, confirmAge16: true, marketingSms: true, marketingEmail: false });
    await tx.customer.update({ where: { id: c.id }, data: { phoneVerifiedAt: new Date() } });
    await startKioskSession(tx, m.deviceCtx, phone);
    await recordPurchase(tx, m.staffCtx, { customerId: c.id, amountCents: 50000 });
    const reward = await tx.reward.create({ data: { merchantId: m.merchant.id, name: "Café", pointsCost: 10 } });
    await redeemReward(tx, m.staffCtx, { customerId: c.id, rewardId: reward.id });
    await tx.wheelPrize.create({ data: { merchantId: m.merchant.id, label: "x", type: "NOTHING", weight: 1 } });
    await tx.wheelSpin.create({ data: { merchantId: m.merchant.id, customerId: c.id, spinDate: new Date("2026-01-01"), prizeLabel: "x" } });
    await createDataRequest(tx, m.staffCtx, { customerId: c.id, type: "ACCESS" });
    const camp = await tx.campaign.create({ data: { merchantId: m.merchant.id, segmentKey: "all", message: "test", status: "SENT" } });
    await tx.campaignRecipient.create({ data: { merchantId: m.merchant.id, campaignId: camp.id, customerId: c.id, status: "SENT", sentAt: new Date() } });
    await tx.automation.create({ data: { merchantId: m.merchant.id, kind: "WELCOME", message: "Bienvenue {prenom}" } });
    await tx.bonusPeriod.create({ data: { merchantId: m.merchant.id, dayOfWeek: 2, startMinute: 840, endMinute: 960, multiplierPercent: 200 } });
    await audit(tx, { merchantId: m.merchant.id, actor: m.staffCtx.actor, action: "test", entityType: "test" });
    return c.id;
  });
}

beforeAll(async () => {
  await resetDb();
  captureSms();
  A = await makeMerchant("A");
  B = await makeMerchant("B");
  await populate(A, "0470111111");
  customerB = await populate(B, "0470222222");
});
afterAll(disconnectAll);

describe("lecture", () => {
  it.each(TENANT_TABLES)("%s : A ne voit aucune ligne de B", async (table) => {
    const [mine, theirs] = await withTenant(A.merchant.id, async (tx) => [
      await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM "${table}"`),
      await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM "${table}" WHERE merchant_id = $1::uuid`, B.merchant.id),
    ]);
    expect(Number(mine[0].n)).toBeGreaterThan(0);
    expect(Number(theirs[0].n)).toBe(0);
  });

  it("merchants : A ne voit que lui-même", async () => {
    const rows = await withTenant(A.merchant.id, (tx) => tx.merchant.findMany());
    expect(rows.map((r) => r.id)).toEqual([A.merchant.id]);
  });

  it("accès direct par identifiant à un client de B : introuvable", async () => {
    const c = await withTenant(A.merchant.id, (tx) => tx.customer.findUnique({ where: { id: customerB } }));
    expect(c).toBeNull();
  });

  it("le même numéro peut exister dans deux commerces sans fuite", async () => {
    const a = await withTenant(A.merchant.id, (tx) => tx.customerIdentifier.count());
    const b = await withTenant(B.merchant.id, (tx) => tx.customerIdentifier.count());
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it("sans commerce défini, revio_app ne voit rien", async () => {
    const app = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    for (const table of [...TENANT_TABLES, "merchants"]) {
      const r = await app.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM "${table}"`);
      expect(Number(r[0].n), table).toBe(0);
    }
    await app.$disconnect();
  });

  it("user_sessions : inaccessible au rôle applicatif", async () => {
    await expect(withTenant(A.merchant.id, (tx) => tx.userSession.findMany())).rejects.toThrow(/permission denied/);
  });

  it("textes modèles Revio (merchant_id NULL) visibles par tous", async () => {
    const n = await withTenant(A.merchant.id, (tx) => tx.legalDocument.count({ where: { merchantId: null } }));
    expect(n).toBe(4);
  });
});

describe("écriture", () => {
  it("A ne peut pas créer une ligne au nom de B", async () => {
    await expect(
      withTenant(A.merchant.id, (tx) => tx.reward.create({ data: { merchantId: B.merchant.id, name: "Pirate", pointsCost: 1 } })),
    ).rejects.toThrow(/row-level security/);
    await expect(
      withTenant(A.merchant.id, (tx) =>
        tx.pointTransaction.create({ data: { merchantId: B.merchant.id, customerId: customerB, type: "ADJUSTMENT", points: 1000, reason: "pirate" } }),
      ),
    ).rejects.toThrow();
  });

  it("A ne peut pas modifier les lignes de B", async () => {
    const r = await withTenant(A.merchant.id, (tx) => tx.reward.updateMany({ where: { merchantId: B.merchant.id }, data: { pointsCost: 1 } }));
    expect(r.count).toBe(0);
    const rules = await withTenant(A.merchant.id, (tx) => tx.rules.updateMany({ where: { merchantId: B.merchant.id }, data: { pointsPerVisit: 999 } }));
    expect(rules.count).toBe(0);
  });

  it("A ne peut pas déplacer une de ses lignes vers B", async () => {
    await expect(
      withTenant(A.merchant.id, (tx) => tx.reward.updateMany({ where: {}, data: { merchantId: B.merchant.id } })),
    ).rejects.toThrow(/row-level security/);
  });

  it("A ne peut pas supprimer les lignes de B", async () => {
    const r = await withTenant(A.merchant.id, (tx) => tx.reward.deleteMany({ where: { merchantId: B.merchant.id } }));
    expect(r.count).toBe(0);
    const left = await systemDb().reward.count({ where: { merchantId: B.merchant.id } });
    expect(left).toBe(1);
  });

  it("changer de commerce en cours de transaction ne donne pas accès aux autres données qu'à ce commerce", async () => {
    // Le réglage est local à la transaction : il ne fuit pas vers la suivante
    await withTenant(A.merchant.id, async () => undefined);
    const app = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    const r = await app.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM customers`;
    expect(Number(r[0].n)).toBe(0);
    await app.$disconnect();
  });
});

describe("registre de points (append-only)", () => {
  it("revio_app ne peut ni modifier ni supprimer un mouvement", async () => {
    await expect(withTenant(A.merchant.id, (tx) => tx.pointTransaction.updateMany({ data: { points: 99999 } }))).rejects.toThrow(/permission denied/);
    await expect(withTenant(A.merchant.id, (tx) => tx.pointTransaction.deleteMany({}))).rejects.toThrow(/permission denied/);
    await expect(withTenant(A.merchant.id, (tx) => tx.consent.deleteMany({}))).rejects.toThrow(/permission denied/);
    await expect(withTenant(A.merchant.id, (tx) => tx.auditLog.deleteMany({}))).rejects.toThrow(/permission denied/);
  });

  it("même le rôle système ne peut pas réécrire un montant", async () => {
    await expect(systemDb().pointTransaction.updateMany({ data: { points: 99999 } })).rejects.toThrow(/immuables/);
    await expect(systemDb().consent.updateMany({ data: { granted: true } })).rejects.toThrow(/immuables/);
  });

  it("une correction sans motif est refusée par la base", async () => {
    await expect(
      systemDb().pointTransaction.create({ data: { merchantId: B.merchant.id, customerId: customerB, type: "ADJUSTMENT", points: 5 } }),
    ).rejects.toThrow(/adjustment_reason/);
  });

  it("la durée de conservation est plafonnée à 36 mois", async () => {
    await expect(
      withTenant(A.merchant.id, (tx) => tx.rules.update({ where: { merchantId: A.merchant.id }, data: { inactivityRetentionMonths: 60 } })),
    ).rejects.toThrow(/retention_cap/);
  });
});
