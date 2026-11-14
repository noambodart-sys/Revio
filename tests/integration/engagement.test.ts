import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { disconnectAll, systemDb } from "@/server/db";
import { enrollFromKiosk, kioskSessionView, verifyKioskCode } from "@/server/services/kiosk";
import { getBalance, recordPurchase } from "@/server/services/points";
import { happyHourStatus, localParts, replaceBonusPeriods } from "@/server/services/engagement";
import { applyTemplate } from "@/server/services/templates";
import { customersToWinBack, impact } from "@/server/services/backoffice";
import { customerSummary } from "@/server/services/customers";
import { captureSms, makeMerchant, resetDb } from "../helpers";

type M = Awaited<ReturnType<typeof makeMerchant>>;
const smsBox = captureSms();
const DAY = 24 * 3600_000;
let n = 0;

async function customer(m: M) {
  n++;
  const { sessionId } = await m.tenant((tx) =>
    enrollFromKiosk(tx, m.deviceCtx, { phone: `0470${String(300000 + n).padStart(6, "0")}`, firstName: `C${n}`, acceptTerms: true, confirmAge16: true, marketingSms: n % 2 === 0, marketingEmail: false }),
  );
  await m.tenant((tx) => verifyKioskCode(tx, m.deviceCtx, sessionId, smsBox.lastCode(), "4821"));
  const s = await m.tenant((tx) => tx.kioskSession.findUniqueOrThrow({ where: { id: sessionId } }));
  return { id: s.customerId!, sessionId };
}
const buy = (m: M, customerId: string, amountCents: number, occurredAt?: Date, kioskSessionId?: string) =>
  m.tenant((tx) => recordPurchase(tx, m.staffCtx, { customerId, amountCents, occurredAt, kioskSessionId }));

beforeAll(async () => {
  await resetDb();
});
afterAll(disconnectAll);

describe("bonus de fidélité", () => {
  it("heures creuses : points ×2 dans le créneau, affichés sur la tablette", async () => {
    const m = await makeMerchant("Café");
    const { isoDay, minute } = localParts(new Date());
    await m.tenant((tx) =>
      replaceBonusPeriods(tx, m.staffCtx, [{ dayOfWeek: isoDay, startMinute: Math.max(0, minute - 60), endMinute: Math.min(1440, minute + 60), multiplierPercent: 200 }]),
    );
    expect((await m.tenant((tx) => happyHourStatus(tx, m.merchant.id))).active?.multiplierPercent).toBe(200);
    const c = await customer(m);
    const r = await buy(m, c.id, 1250, undefined, c.sessionId);
    expect(r).toMatchObject({ basePoints: 12, earned: 24 });
    expect(r.bonuses).toEqual([{ type: "HAPPY_HOUR_BONUS", points: 12, detail: { multiplierPercent: 200 } }]);
    const view = await m.tenant((tx) => kioskSessionView(tx, m.deviceCtx, c.sessionId));
    expect(view.purchase).toMatchObject({ earned: 24, bonuses: [{ type: "HAPPY_HOUR_BONUS", points: 12 }] });
    // Hors créneau : rien
    const old = await buy(m, c.id, 1000, new Date(Date.now() - 3 * DAY));
    expect(old.bonuses).toEqual([]);
  });

  it("Ne visite : bonus à la 3e et la 6e visite", async () => {
    const m = await makeMerchant("Boulangerie");
    await m.tenant((tx) => tx.rules.update({ where: { merchantId: m.merchant.id }, data: { visitMilestoneEvery: 3, visitMilestonePoints: 25 } }));
    const c = await customer(m);
    const got = [];
    for (let i = 0; i < 6; i++) got.push((await buy(m, c.id, 500)).bonuses.map((b) => b.type));
    expect(got).toEqual([[], [], ["VISIT_MILESTONE_BONUS"], [], [], ["VISIT_MILESTONE_BONUS"]]);
    const s = await m.tenant((tx) => customerSummary(tx, c.id));
    expect(s.engagement).toMatchObject({ visits: 6, nextMilestone: { inVisits: 3, points: 25, atVisit: 9 } });
  });

  it("régularité : bonus après 4 semaines d'affilée, une seule fois par semaine", async () => {
    const m = await makeMerchant("Boucherie");
    await m.tenant((tx) => tx.rules.update({ where: { merchantId: m.merchant.id }, data: { streakWeeks: 4, streakPoints: 30 } }));
    const c = await customer(m);
    for (const d of [21, 14, 7]) expect((await buy(m, c.id, 1000, new Date(Date.now() - d * DAY))).bonuses).toEqual([]);
    const fourth = await buy(m, c.id, 1000);
    expect(fourth.bonuses).toEqual([{ type: "STREAK_BONUS", points: 30, detail: { weeks: 4 } }]);
    expect((await buy(m, c.id, 1000)).bonuses).toEqual([]); // 2e visite de la semaine
    const s = await m.tenant((tx) => customerSummary(tx, c.id));
    expect(s.engagement).toMatchObject({ streakWeeks: 4, visitedThisWeek: true, streakGoal: { weeks: 4, points: 30 } });
  });

  it("anniversaire d'inscription : une fois par an", async () => {
    const m = await makeMerchant("Librairie");
    await m.tenant((tx) => tx.rules.update({ where: { merchantId: m.merchant.id }, data: { anniversaryPoints: 50 } }));
    const c = await customer(m);
    expect((await buy(m, c.id, 1000)).bonuses).toEqual([]);
    await systemDb().customer.update({ where: { id: c.id }, data: { enrolledAt: new Date(Date.now() - 400 * DAY) } });
    expect((await buy(m, c.id, 1000)).bonuses).toEqual([{ type: "ANNIVERSARY_BONUS", points: 50, detail: { years: 1 } }]);
    expect((await buy(m, c.id, 1000)).bonuses).toEqual([]);
  });

  it("le plafond quotidien s'applique aussi aux bonus", async () => {
    const m = await makeMerchant("Coiffeur");
    await m.tenant((tx) => tx.rules.update({ where: { merchantId: m.merchant.id }, data: { dailyPointsCap: 20, visitMilestoneEvery: 2, visitMilestonePoints: 50 } }));
    const c = await customer(m);
    await buy(m, c.id, 1000);
    const r = await buy(m, c.id, 500);
    expect(r).toMatchObject({ earned: 10, capped: true, bonuses: [{ type: "VISIT_MILESTONE_BONUS", points: 5 }] });
    expect(await m.tenant((tx) => getBalance(tx, c.id))).toBe(20);
  });
});

describe("modèles par métier", () => {
  it("applique règles, niveaux, récompenses, roue, heures creuses et apparence", async () => {
    const m = await makeMerchant("Nouveau");
    await m.tenant((tx) => tx.reward.create({ data: { merchantId: m.merchant.id, name: "Ancienne", pointsCost: 10 } }));
    await m.tenant((tx) => applyTemplate(tx, m.staffCtx, "boulangerie"));
    const [rules, rewards, tiers, wheel, periods, merchant] = await m.tenant((tx) =>
      Promise.all([
        tx.rules.findUniqueOrThrow({ where: { merchantId: m.merchant.id } }),
        tx.reward.findMany({ where: { active: true } }),
        tx.tierLevel.findMany(),
        tx.wheelPrize.findMany({ where: { active: true } }),
        tx.bonusPeriod.findMany(),
        tx.merchant.findUniqueOrThrow({ where: { id: m.merchant.id } }),
      ]),
    );
    expect(Number(rules.pointsPerEuro)).toBe(2);
    expect(rules).toMatchObject({ visitMilestoneEvery: 10, streakWeeks: 4, anniversaryPoints: 50 });
    expect(rewards.map((r) => r.name)).toContain("Croissant offert");
    expect(rewards.map((r) => r.name)).not.toContain("Ancienne");
    expect(tiers).toHaveLength(3);
    expect(wheel.find((w) => w.type === "REWARD")?.rewardId).toBeTruthy();
    expect(periods).toHaveLength(5);
    expect(merchant).toMatchObject({ businessType: "boulangerie", primaryColor: "#b45309" });
    await expect(m.tenant((tx) => applyTemplate(tx, m.staffCtx, "inconnu"))).rejects.toMatchObject({ code: "UNKNOWN_TEMPLATE" });
  });
});

describe("ce que le programme rapporte", () => {
  it("clients revenus, part des réguliers, clients à relancer", async () => {
    const m = await makeMerchant("Épicerie");
    await m.tenant((tx) => tx.rules.update({ where: { merchantId: m.merchant.id }, data: { dailyPointsCap: null } }));
    // Revenu après 50 jours d'absence
    const back = await customer(m);
    await buy(m, back.id, 3000, new Date(Date.now() - 50 * DAY));
    await buy(m, back.id, 2000, new Date(Date.now() - 2 * DAY));
    await buy(m, back.id, 1000);
    // Régulier sans absence
    const regular = await customer(m);
    await buy(m, regular.id, 500, new Date(Date.now() - 3 * DAY));
    await buy(m, regular.id, 500);
    // Habitué disparu : tous les 10 jours, plus rien depuis 40 jours
    const gone = await customer(m);
    for (const d of [60, 50, 40]) await buy(m, gone.id, 1500, new Date(Date.now() - d * DAY));

    const i = await m.tenant((tx) => impact(tx, m.merchant.id));
    expect(i).toMatchObject({ returningCustomers: 1, returningRevenueCents: 3000, regularCustomers: 2, regularRevenueCents: 4000 });
    expect(i.regularShare).toBe(100);

    const w = await m.tenant((tx) => customersToWinBack(tx, m.merchant.id));
    expect(w.map((x) => x.id)).toEqual([gone.id]);
    expect(w[0]).toMatchObject({ visits: 3, usualEveryDays: 10, daysSince: 40, balance: 45 });
    expect(w[0].maskedPhone).toMatch(/^\+32 4•• •• •• \d\d$/);
  });
});
