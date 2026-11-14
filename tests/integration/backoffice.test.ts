import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { disconnectAll, systemDb } from "@/server/db";
import { enrollFromKiosk, kioskSessionView, verifyKioskCode } from "@/server/services/kiosk";
import { recordPurchase } from "@/server/services/points";
import { redeemReward } from "@/server/services/rewards";
import { adjustPoints } from "@/server/services/points";
import { dashboard, exportCustomersCsv, listCustomers, updateBranding } from "@/server/services/backoffice";
import { getRules } from "@/server/services/rules";
import { captureSms, makeMerchant, resetDb } from "../helpers";

type M = Awaited<ReturnType<typeof makeMerchant>>;
const smsBox = captureSms();
let M1: M;

async function customer(m: M, phone: string, firstName: string, marketingSms = false) {
  const { sessionId } = await m.tenant((tx) =>
    enrollFromKiosk(tx, m.deviceCtx, { phone, firstName, acceptTerms: true, confirmAge16: true, marketingSms, marketingEmail: false }),
  );
  await m.tenant((tx) => verifyKioskCode(tx, m.deviceCtx, sessionId, smsBox.lastCode(), "4821"));
  const s = await m.tenant((tx) => tx.kioskSession.findUniqueOrThrow({ where: { id: sessionId } }));
  return { id: s.customerId!, sessionId };
}

beforeAll(async () => {
  await resetDb();
  M1 = await makeMerchant("Boucherie");
  const a = await customer(M1, "0470100001", "Alice", true);
  const b = await customer(M1, "0470100002", "Bruno");
  await customer(M1, "0470100003", "Albert");
  await M1.tenant(async (tx) => {
    await recordPurchase(tx, M1.staffCtx, { customerId: a.id, amountCents: 15000 });
    await recordPurchase(tx, M1.staffCtx, { customerId: a.id, amountCents: 2000 });
    await recordPurchase(tx, M1.staffCtx, { customerId: b.id, amountCents: 999 });
    const reward = await tx.reward.create({ data: { merchantId: M1.merchant.id, name: "Saucisson", pointsCost: 100 } });
    await redeemReward(tx, M1.staffCtx, { customerId: a.id, rewardId: reward.id });
  });
});
afterAll(disconnectAll);

describe("tableau de bord", () => {
  it("chiffres des 30 derniers jours", async () => {
    const d = await M1.tenant((tx) => dashboard(tx, M1.merchant.id));
    expect(d.customers).toEqual({ total: 3, active30: 2, new30: 3 });
    expect(d.visits.last30).toBe(3);
    expect(d.revenue30Cents).toBe(17999);
    expect(d.points.redeemed30).toBe(100);
    expect(d.points.outstanding).toBe(d.points.earned30 - 100);
    expect(d.topRewards).toEqual([{ name: "Saucisson", count: 1 }]);
    expect(d.visitsByDay).toHaveLength(30);
    expect(d.visitsByDay.at(-1)!.visits).toBe(3);
  });

  it("les alertes anti-fraude remontent", async () => {
    const ids = await M1.tenant((tx) => tx.customer.findMany({ select: { id: true } }));
    await M1.tenant((tx) => tx.rules.update({ where: { merchantId: M1.merchant.id }, data: { adjustmentAlertDailyCount: 1 } }));
    await M1.tenant((tx) => adjustPoints(tx, M1.staffCtx, { customerId: ids[0].id, points: 5, reason: "Geste commercial" }));
    const d = await M1.tenant((tx) => dashboard(tx, M1.merchant.id));
    expect(d.alerts.map((a) => a.action)).toContain("fraud.adjustment_alert");
  });
});

describe("liste des clients", () => {
  it("triée par dernière visite, soldes et passages", async () => {
    const r = await M1.tenant((tx) => listCustomers(tx, M1.merchant.id, { page: 1 }));
    expect(r.total).toBe(3);
    const alice = r.items.find((c) => c.firstName === "Alice")!;
    expect(alice).toMatchObject({ visits: 2, maskedPhone: "+32 4•• •• •• 01", marketingSms: true });
    expect(r.items.at(-1)!.firstName).toBe("Albert"); // jamais venu
  });

  it("recherche par début de prénom et par numéro exact", async () => {
    const byName = await M1.tenant((tx) => listCustomers(tx, M1.merchant.id, { q: "al", page: 1 }));
    expect(byName.items.map((c) => c.firstName).sort()).toEqual(["Albert", "Alice"]);
    const byPhone = await M1.tenant((tx) => listCustomers(tx, M1.merchant.id, { q: "0470 10 00 02", page: 1 }));
    expect(byPhone.items.map((c) => c.firstName)).toEqual(["Bruno"]);
    const none = await M1.tenant((tx) => listCustomers(tx, M1.merchant.id, { q: "0470999999", page: 1 }));
    expect(none.total).toBe(0);
  });

  it("export CSV : numéros masqués, tracé dans l'audit", async () => {
    const csv = await M1.tenant((tx) => exportCustomersCsv(tx, M1.staffCtx));
    expect(csv.startsWith("﻿Prénom;")).toBe(true);
    expect(csv.split("\r\n")).toHaveLength(4);
    expect(csv).not.toMatch(/47010000\d/);
    expect(await systemDb().auditLog.count({ where: { merchantId: M1.merchant.id, action: "customers.export_csv" } })).toBe(1);
  });
});

describe("apparence", () => {
  it("couleur et logo en image intégrée uniquement", async () => {
    const r = await M1.tenant((tx) => updateBranding(tx, M1.staffCtx, { primaryColor: "#123abc", logoUrl: "data:image/png;base64,iVBORw0KGgo=" }));
    expect(r.primaryColor).toBe("#123abc");
    await expect(M1.tenant((tx) => updateBranding(tx, M1.staffCtx, { logoUrl: "https://pirate.example/x.png" }))).rejects.toMatchObject({ code: "INVALID_LOGO" });
    await expect(M1.tenant((tx) => updateBranding(tx, M1.staffCtx, { logoUrl: "data:image/svg+xml;base64,PHN2Zz4=" }))).rejects.toMatchObject({ code: "INVALID_LOGO" });
  });
});

describe("offre Essentiel", () => {
  it("roue et niveaux désactivés même s'ils sont réglés", async () => {
    const E = await makeMerchant("Librairie");
    await systemDb().merchant.update({ where: { id: E.merchant.id }, data: { plan: "ESSENTIEL" } });
    await E.tenant(async (tx) => {
      await tx.rules.update({ where: { merchantId: E.merchant.id }, data: { wheelEnabled: true, tiersEnabled: true, dailyPointsCap: null } });
      await tx.wheelPrize.createMany({
        data: [
          { merchantId: E.merchant.id, label: "a", type: "NOTHING", weight: 1 },
          { merchantId: E.merchant.id, label: "b", type: "NOTHING", weight: 1 },
        ],
      });
    });
    const rules = await E.tenant((tx) => getRules(tx, E.merchant.id));
    expect(rules).toMatchObject({ wheelEnabled: false, tiersEnabled: false });

    const c = await customer(E, "0470200001", "Eva");
    await E.tenant((tx) => recordPurchase(tx, E.staffCtx, { customerId: c.id, amountCents: 50000 }));
    const r = await E.tenant((tx) => recordPurchase(tx, E.staffCtx, { customerId: c.id, amountCents: 10000, kioskSessionId: null }));
    expect(r.bonusPoints).toBe(0);
    expect(r.tier).toBeNull();
    const view = await E.tenant((tx) => kioskSessionView(tx, E.deviceCtx, c.sessionId));
    expect(view.wheel).toBeNull();
  });
});
