import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { applyDailyCap, computeBaseEarn, computeTierBonus, pickTier } from "@/server/services/points";
import { pickPrize } from "@/server/services/wheel";

const rules = (o: Partial<Parameters<typeof computeBaseEarn>[0]> = {}) => ({
  earnMode: "PER_EURO" as const,
  pointsPerEuro: new Prisma.Decimal(1),
  pointsPerVisit: 10,
  minPurchaseCents: 0,
  ...o,
});

describe("calcul des points", () => {
  it("1 point par euro, arrondi à l'inférieur", () => {
    expect(computeBaseEarn(rules(), 1299)).toBe(12);
    expect(computeBaseEarn(rules(), 99)).toBe(0);
    expect(computeBaseEarn(rules(), 10000)).toBe(100);
  });
  it("taux décimal sans erreur de flottant", () => {
    expect(computeBaseEarn(rules({ pointsPerEuro: new Prisma.Decimal("1.5") }), 1000)).toBe(15);
    expect(computeBaseEarn(rules({ pointsPerEuro: new Prisma.Decimal("0.1") }), 2999)).toBe(2);
    expect(computeBaseEarn(rules({ pointsPerEuro: new Prisma.Decimal("0.07") }), 10000)).toBe(7);
  });
  it("montant fixe par passage", () => {
    expect(computeBaseEarn(rules({ earnMode: "PER_VISIT" }), 50)).toBe(10);
  });
  it("achat minimum", () => {
    expect(computeBaseEarn(rules({ minPurchaseCents: 500 }), 499)).toBe(0);
    expect(computeBaseEarn(rules({ minPurchaseCents: 500 }), 500)).toBe(5);
  });
  it("bonus de niveau arrondi à l'inférieur", () => {
    expect(computeTierBonus(25, 10)).toBe(2);
    expect(computeTierBonus(9, 10)).toBe(0);
  });
  it("plafond quotidien", () => {
    expect(applyDailyCap(100, 450, 500)).toEqual({ granted: 50, capped: true });
    expect(applyDailyCap(100, 600, 500)).toEqual({ granted: 0, capped: true });
    expect(applyDailyCap(100, 0, null)).toEqual({ granted: 100, capped: false });
  });
  it("choix du niveau", () => {
    const tiers = [
      { rank: 0, minPoints: 0, name: "Bronze" },
      { rank: 1, minPoints: 300, name: "Argent" },
      { rank: 2, minPoints: 1000, name: "Or" },
    ];
    expect(pickTier(tiers, 0)?.name).toBe("Bronze");
    expect(pickTier(tiers, 299)?.name).toBe("Bronze");
    expect(pickTier(tiers, 300)?.name).toBe("Argent");
    expect(pickTier(tiers, 5000)?.name).toBe("Or");
  });
});

describe("roue", () => {
  const prizes = [
    { id: "a", weight: 50 },
    { id: "b", weight: 30 },
    { id: "c", weight: 20 },
  ];
  it("tirage pondéré déterministe", () => {
    expect(pickPrize(prizes, 0).id).toBe("a");
    expect(pickPrize(prizes, 49).id).toBe("a");
    expect(pickPrize(prizes, 50).id).toBe("b");
    expect(pickPrize(prizes, 79).id).toBe("b");
    expect(pickPrize(prizes, 80).id).toBe("c");
    expect(pickPrize(prizes, 99).id).toBe("c");
  });
  it("distribution aléatoire proche des poids", () => {
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 20000; i++) counts[pickPrize(prizes).id]++;
    expect(counts.a / 20000).toBeGreaterThan(0.47);
    expect(counts.a / 20000).toBeLessThan(0.53);
    expect(counts.c / 20000).toBeGreaterThan(0.17);
  });
});
