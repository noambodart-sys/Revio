import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { disconnectAll, systemDb } from "@/server/db";
import { enrollFromKiosk, kioskSessionView, startKioskSession, submitKioskPin, verifyKioskCode } from "@/server/services/kiosk";
import { recordPurchase } from "@/server/services/points";
import { activeOffers, campaignResults, previewCampaign, redeemOffer, sendCampaign } from "@/server/services/campaigns";
import { listSegments } from "@/server/services/segments";
import { suggestions } from "@/server/services/today";
import { captureSms, makeMerchant, resetDb } from "../helpers";

type M = Awaited<ReturnType<typeof makeMerchant>>;
const smsBox = captureSms();
const DAY = 24 * 3600_000;
// Mardi 17 novembre 2026, 11:00 à Bruxelles : dans la plage d'envoi
const TUESDAY = new Date("2026-11-17T10:00:00Z");
let n = 0;

async function customer(m: M, marketingSms: boolean, firstName = `Client${n}`) {
  n++;
  const phone = `0470${String(500000 + n).padStart(6, "0")}`;
  const { sessionId } = await m.tenant((tx) => enrollFromKiosk(tx, m.deviceCtx, { phone, firstName, acceptTerms: true, confirmAge16: true, marketingSms, marketingEmail: false }));
  await m.tenant((tx) => verifyKioskCode(tx, m.deviceCtx, sessionId, smsBox.lastCode(), "4821"));
  const s = await m.tenant((tx) => tx.kioskSession.findUniqueOrThrow({ where: { id: sessionId } }));
  return { id: s.customerId!, phone };
}

const promo = { segmentKey: "all" as const, templateKey: "promo", fields: { remise: "-20 %", produit: "les croissants", quand: "ce week-end" }, withOffer: true };

let M1: M;
let yes1: { id: string; phone: string }, yes2: { id: string; phone: string }, no1: { id: string; phone: string };

beforeAll(async () => {
  await resetDb();
  M1 = await makeMerchant("Boulangerie");
  yes1 = await customer(M1, true, "Léa");
  yes2 = await customer(M1, true, "");
  no1 = await customer(M1, false, "Marc");
});
afterAll(disconnectAll);

describe("campagnes SMS", () => {
  it("aperçu : seuls les clients d'accord sont comptés, message personnalisé, coût", async () => {
    const p = await M1.tenant((tx) => previewCampaign(tx, M1.merchant.id, promo, TUESDAY));
    expect(p).toMatchObject({ members: 3, recipients: 2, excluded: { noConsent: 1, monthlyLimit: 0 }, offerTitle: "-20 % sur les croissants" });
    expect(p.sample).toMatch(/^Bonjour Léa ! -20 % sur les croissants ce week-end chez Boulangerie \d+\. A tres vite ! STOP SMS: repondez STOP$/);
    expect(p.info).toMatchObject({ encoding: "GSM", parts: 1 });
    expect(p.costCents).toBe(16);
    expect(p.window.open).toBe(true);
  });

  it("refusé en dehors des heures d'envoi", async () => {
    await expect(sendCampaign(M1.staffCtx, promo, new Date("2026-11-17T21:00:00Z"))).rejects.toMatchObject({ code: "OUTSIDE_SEND_WINDOW" });
  });

  it("envoi : SMS uniquement aux clients d'accord, prénom absent géré, audit", async () => {
    smsBox.sent.length = 0;
    const r = await sendCampaign(M1.staffCtx, promo, TUESDAY);
    expect(r).toMatchObject({ sent: 2, failed: 0 });
    expect(smsBox.sent.map((s) => s.to).sort()).toEqual([`+32${yes1.phone.slice(1)}`, `+32${yes2.phone.slice(1)}`].sort());
    expect(smsBox.sent.some((s) => s.text.startsWith("Bonjour ! -20 %"))).toBe(true);
    expect(smsBox.sent.every((s) => s.text.endsWith("STOP SMS: repondez STOP"))).toBe(true);
    expect(await systemDb().auditLog.count({ where: { action: "campaign.send", merchantId: M1.merchant.id } })).toBe(1);
  });

  it("limite mensuelle : au-delà de N SMS sur 30 jours, le client n'est plus contacté", async () => {
    await M1.tenant((tx) => tx.rules.update({ where: { merchantId: M1.merchant.id }, data: { smsMaxPerMonth: 1 } }));
    const p = await M1.tenant((tx) => previewCampaign(tx, M1.merchant.id, promo, TUESDAY));
    expect(p).toMatchObject({ recipients: 0, excluded: { noConsent: 1, monthlyLimit: 2 } });
    await expect(sendCampaign(M1.staffCtx, promo, TUESDAY)).rejects.toMatchObject({ code: "NO_RECIPIENTS" });
    await M1.tenant((tx) => tx.rules.update({ where: { merchantId: M1.merchant.id }, data: { smsMaxPerMonth: 2 } }));
  });

  it("l'offre s'affiche sur la tablette et en caisse, utilisable une seule fois", async () => {
    const start = await M1.tenant((tx) => startKioskSession(tx, M1.deviceCtx, yes1.phone));
    if (start.kind !== "KNOWN") throw new Error();
    await M1.tenant((tx) => submitKioskPin(tx, M1.deviceCtx, start.sessionId, "4821"));
    const view = await M1.tenant((tx) => kioskSessionView(tx, M1.deviceCtx, start.sessionId));
    expect(view.customer?.offers).toHaveLength(1);
    expect(view.customer?.offers[0].title).toBe("-20 % sur les croissants");
    const offerId = view.customer!.offers[0].id;
    await M1.tenant((tx) => redeemOffer(tx, M1.staffCtx, offerId));
    await expect(M1.tenant((tx) => redeemOffer(tx, M1.staffCtx, offerId))).rejects.toMatchObject({ code: "OFFER_ALREADY_USED" });
    expect(await M1.tenant((tx) => activeOffers(tx, yes1.id))).toEqual([]);
    // Le client sans accord marketing n'a reçu aucune offre
    expect(await M1.tenant((tx) => activeOffers(tx, no1.id))).toEqual([]);
  });

  it("résultats : clients venus dans les 7 jours, achats, offres utilisées", async () => {
    await M1.tenant((tx) => recordPurchase(tx, M1.staffCtx, { customerId: yes1.id, amountCents: 1850 }));
    await M1.tenant((tx) => recordPurchase(tx, M1.staffCtx, { customerId: no1.id, amountCents: 999 })); // pas destinataire
    const [c] = await M1.tenant((tx) => campaignResults(tx, M1.merchant.id));
    expect(c).toMatchObject({ sent: 2, failed: 0, visitors: 1, revenueCents: 1850, redeemed: 1, offerTitle: "-20 % sur les croissants" });
  });

  it("groupes et suggestions du jour", async () => {
    const segs = await M1.tenant((tx) => listSegments(tx, M1.merchant.id));
    expect(segs.find((s) => s.key === "all")).toMatchObject({ count: 3, reachable: 2 });
    const sug = await M1.tenant((tx) => suggestions(tx, M1.merchant.id));
    expect(sug.length).toBeGreaterThan(0);
    expect(sug[0]).toHaveProperty("templateKey");
  });

  it("un autre commerce ne voit ni les campagnes ni les offres", async () => {
    const other = await makeMerchant("Autre");
    expect(await other.tenant((tx) => tx.campaign.count())).toBe(0);
    expect(await other.tenant((tx) => tx.campaignRecipient.count())).toBe(0);
    await expect(other.tenant((tx) => redeemOffer(tx, other.staffCtx, "00000000-0000-0000-0000-000000000000"))).rejects.toMatchObject({ status: 404 });
  });
});

void DAY;
