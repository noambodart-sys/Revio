import { describe, expect, it } from "vitest";
import { fillVariables, smsInfo } from "@/server/services/sms-text";
import { bestThreshold, inSegment, reachable, type CustomerRow } from "@/server/services/segments";
import { buildMessage, sendWindow } from "@/server/services/campaigns";

describe("longueur des SMS", () => {
  it("alphabet SMS : 160 caractères, puis 153 par partie", () => {
    expect(smsInfo("a".repeat(160))).toMatchObject({ encoding: "GSM", parts: 1 });
    expect(smsInfo("a".repeat(161))).toMatchObject({ encoding: "GSM", parts: 2 });
    expect(smsInfo("Bonjour Léa, à très vite !")).toMatchObject({ encoding: "GSM", parts: 1 });
    expect(smsInfo("€").length).toBe(2);
  });
  it("un emoji ou un ç fait passer en Unicode (70 caractères)", () => {
    expect(smsInfo("Promo 🎉")).toMatchObject({ encoding: "UNICODE", parts: 1 });
    expect(smsInfo("ça " + "a".repeat(70))).toMatchObject({ encoding: "UNICODE", parts: 2 });
  });
  it("variables et nettoyage des espaces", () => {
    expect(fillVariables("Bonjour {prenom} ! A bientot.", { prenom: "Léa" })).toBe("Bonjour Léa ! A bientot.");
    expect(fillVariables("Bonjour {prenom} ! A bientot.", { prenom: "" })).toBe("Bonjour ! A bientot.");
    expect(fillVariables("{prenom}, plus que 20 points", { prenom: "" })).toBe("Plus que 20 points");
    expect(fillVariables("{prenom}, plus que 20 points", { prenom: "Léa" })).toBe("Léa, plus que 20 points");
  });
});

describe("modèles de messages", () => {
  it("remplit les champs et prépare l'offre du comptoir", () => {
    const m = buildMessage({ segmentKey: "all", templateKey: "promo", fields: { remise: "-20 %", produit: "les croissants", quand: "ce week-end" }, withOffer: true });
    expect(m.body).toBe("Bonjour {prenom} ! -20 % sur les croissants ce week-end chez {commerce}. On vous attend !");
    expect(m.offerTitle).toBe("-20 % sur les croissants");
  });
  it("champ manquant ou message libre vide : refusé", () => {
    expect(() => buildMessage({ segmentKey: "all", templateKey: "promo", fields: { remise: "-20 %" }, withOffer: true })).toThrow(/Complétez/);
    expect(() => buildMessage({ segmentKey: "all", templateKey: "free", fields: {}, freeText: "", withOffer: true })).toThrow(/Écrivez/);
  });
  it("plage d'envoi : 9 h – 20 h, pas le dimanche (heure de Bruxelles)", () => {
    expect(sendWindow(new Date("2026-11-17T09:00:00Z")).open).toBe(true); // mardi 10:00
    expect(sendWindow(new Date("2026-11-17T07:30:00Z")).open).toBe(false); // mardi 8:30
    expect(sendWindow(new Date("2026-11-17T19:00:00Z")).open).toBe(false); // mardi 20:00
    expect(sendWindow(new Date("2026-11-22T11:00:00Z")).open).toBe(false); // dimanche
  });
});

describe("groupes de clients", () => {
  const now = new Date("2026-11-16T12:00:00Z");
  const base: CustomerRow = {
    id: "x", firstName: "A", maskedPhone: null, enrolledAt: new Date("2026-01-01"), lastVisitAt: new Date("2026-11-10"),
    visits: 5, visits60: 3, balance: 80, earned90: 100, marketingSms: true, sms30: 0, nextReward: { name: "Café", pointsCost: 100, missing: 20 },
  };
  const ctx = { now, bestThreshold: 100 };
  it("habitués, absents, nouveaux, proches d'une récompense, anniversaire", () => {
    expect(inSegment("regulars", base, ctx)).toBe(true);
    expect(inSegment("lapsed", base, ctx)).toBe(false);
    expect(inSegment("lapsed", { ...base, lastVisitAt: new Date("2026-09-01") }, ctx)).toBe(true);
    expect(inSegment("new", { ...base, enrolledAt: new Date("2026-11-01") }, ctx)).toBe(true);
    expect(inSegment("nearReward", base, ctx)).toBe(true);
    expect(inSegment("nearReward", { ...base, nextReward: { name: "x", pointsCost: 400, missing: 300 } }, ctx)).toBe(false);
    expect(inSegment("anniversary", { ...base, enrolledAt: new Date("2025-11-03") }, ctx)).toBe(true);
    expect(inSegment("anniversary", { ...base, enrolledAt: new Date("2026-11-03") }, ctx)).toBe(false);
  });
  it("meilleur quart et joignabilité (accord + limite mensuelle)", () => {
    expect(bestThreshold([{ ...base, earned90: 10 }, { ...base, earned90: 50 }, { ...base, earned90: 30 }, { ...base, earned90: 5 }])).toBe(50);
    expect(reachable(base, 2)).toBe(true);
    expect(reachable({ ...base, marketingSms: false }, 2)).toBe(false);
    expect(reachable({ ...base, sms30: 2 }, 2)).toBe(false);
  });
});
