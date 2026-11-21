import { describe, expect, it } from "vitest";
import { isEligible, type EligibilityContext } from "@/server/services/automations";
import type { CustomerRow } from "@/server/services/segments";

const DAY = 24 * 3600_000;
const now = new Date("2026-11-17T10:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * DAY);
const base: CustomerRow = {
  id: "c1", firstName: "Léa", maskedPhone: null, enrolledAt: ago(200), lastVisitAt: ago(2), visits: 5, visits60: 2, balance: 50, earned90: 50,
  marketingSms: true, sms30: 0, firstVisitAt: ago(200), lastRedeemAt: null, nextReward: { name: "Café", pointsCost: 100, missing: 50 }, affordableReward: null,
};
const ctx = (o: Partial<EligibilityContext> = {}): EligibilityContext => ({
  now, rules: { pointsExpiryMonths: 12, expiryReminderDays: 30 }, googleReviewUrl: "https://g.page/r/test/review", lastSent: new Map(), ...o,
});

describe("pilote automatique : qui reçoit quoi", () => {
  it("bienvenue : le lendemain de l'inscription, une seule fois", () => {
    expect(isEligible("WELCOME", { ...base, enrolledAt: ago(1) }, {}, ctx())).toBe(true);
    expect(isEligible("WELCOME", { ...base, enrolledAt: ago(0.1) }, {}, ctx())).toBe(false); // trop tôt
    expect(isEligible("WELCOME", { ...base, enrolledAt: ago(10) }, {}, ctx())).toBe(false); // trop tard
    expect(isEligible("WELCOME", { ...base, enrolledAt: ago(1) }, {}, ctx({ lastSent: new Map([["c1", ago(0.5)]]) }))).toBe(false);
  });

  it("récompense disponible : une fois par cycle, jamais pendant qu'il est au comptoir", () => {
    const rich = { ...base, balance: 120, affordableReward: { name: "Café", pointsCost: 100 } };
    expect(isEligible("REWARD_READY", rich, {}, ctx())).toBe(true);
    expect(isEligible("REWARD_READY", { ...rich, lastVisitAt: new Date(now.getTime() - 3600_000) }, {}, ctx())).toBe(false);
    expect(isEligible("REWARD_READY", rich, {}, ctx({ lastSent: new Map([["c1", ago(5)]]) }))).toBe(false);
    // Nouveau cycle après avoir utilisé une récompense
    expect(isEligible("REWARD_READY", { ...rich, lastRedeemAt: ago(3) }, {}, ctx({ lastSent: new Map([["c1", ago(5)]]) }))).toBe(true);
  });

  it("relance : habitué absent depuis 2× son rythme, une fois par absence", () => {
    // 5 visites en 40 jours (rythme 10 j), absent depuis 35 j
    const gone = { ...base, firstVisitAt: ago(75), lastVisitAt: ago(35), visits: 5 };
    expect(isEligible("WIN_BACK", gone, { minDays: 30 }, ctx())).toBe(true);
    expect(isEligible("WIN_BACK", gone, { minDays: 40 }, ctx())).toBe(false);
    expect(isEligible("WIN_BACK", { ...gone, visits: 2 }, { minDays: 30 }, ctx())).toBe(false);
    expect(isEligible("WIN_BACK", gone, { minDays: 30 }, ctx({ lastSent: new Map([["c1", ago(3)]]) }))).toBe(false);
  });

  it("anniversaire de fidélité : le jour même (ou jusqu'à 3 jours après), une fois par an", () => {
    const c = { ...base, enrolledAt: new Date("2025-11-16T09:00:00Z") };
    expect(isEligible("LOYALTY_ANNIVERSARY", c, {}, ctx())).toBe(true);
    expect(isEligible("LOYALTY_ANNIVERSARY", { ...c, enrolledAt: new Date("2025-10-01T09:00:00Z") }, {}, ctx())).toBe(false);
    expect(isEligible("LOYALTY_ANNIVERSARY", c, {}, ctx({ lastSent: new Map([["c1", ago(1)]]) }))).toBe(false);
  });

  it("points bientôt expirés : dans le délai de rappel, une fois", () => {
    const c = { ...base, lastVisitAt: ago(350) }; // expire dans ~15 jours
    expect(isEligible("POINTS_EXPIRING", c, {}, ctx())).toBe(true);
    expect(isEligible("POINTS_EXPIRING", { ...c, lastVisitAt: ago(100) }, {}, ctx())).toBe(false);
    expect(isEligible("POINTS_EXPIRING", { ...c, balance: 0 }, {}, ctx())).toBe(false);
  });

  it("avis Google : après N visites, juste après un passage, une seule fois, lien requis", () => {
    expect(isEligible("REVIEW_REQUEST", base, { afterVisits: 3 }, ctx())).toBe(true);
    expect(isEligible("REVIEW_REQUEST", base, { afterVisits: 3 }, ctx({ googleReviewUrl: null }))).toBe(false);
    expect(isEligible("REVIEW_REQUEST", { ...base, lastVisitAt: ago(10) }, { afterVisits: 3 }, ctx())).toBe(false);
    expect(isEligible("REVIEW_REQUEST", base, { afterVisits: 8 }, ctx())).toBe(false);
  });
});
