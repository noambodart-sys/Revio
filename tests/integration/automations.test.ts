import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { disconnectAll, systemDb } from "@/server/db";
import { enrollFromKiosk, verifyKioskCode } from "@/server/services/kiosk";
import { recordPurchase } from "@/server/services/points";
import { listAutomations, runMerchantAutomations, updateAutomation } from "@/server/services/automations";
import { activeOffers } from "@/server/services/campaigns";
import { captureSms, makeMerchant, resetDb } from "../helpers";

type M = Awaited<ReturnType<typeof makeMerchant>>;
const smsBox = captureSms();
const DAY = 24 * 3600_000;
const TUESDAY = new Date("2026-11-17T10:00:00Z"); // 11 h à Bruxelles
let M1: M;
let n = 0;

async function customer(m: M, marketingSms: boolean) {
  n++;
  const { sessionId } = await m.tenant((tx) => enrollFromKiosk(tx, m.deviceCtx, { phone: `0470${String(800000 + n)}`, firstName: `C${n}`, acceptTerms: true, confirmAge16: true, marketingSms, marketingEmail: false }));
  await m.tenant((tx) => verifyKioskCode(tx, m.deviceCtx, sessionId, smsBox.lastCode(), "4821"));
  return (await m.tenant((tx) => tx.kioskSession.findUniqueOrThrow({ where: { id: sessionId } }))).customerId!;
}

beforeAll(async () => {
  await resetDb();
  M1 = await makeMerchant("Boulangerie");
});
afterAll(disconnectAll);

describe("pilote automatique", () => {
  it("par défaut tout est éteint ; l'activation est tracée", async () => {
    const list = await M1.tenant((tx) => listAutomations(tx, M1.merchant.id));
    expect(list).toHaveLength(6);
    expect(list.every((a) => !a.enabled)).toBe(true);
    await M1.tenant((tx) => updateAutomation(tx, M1.staffCtx, "WIN_BACK", { enabled: true, params: { minDays: 30, offer: "un croissant offert", offerDays: 14 } }));
    expect(await systemDb().auditLog.count({ where: { action: "automation.update", merchantId: M1.merchant.id } })).toBe(1);
  });

  it("refuse une variable inconnue et la demande d'avis sans lien Google", async () => {
    await expect(M1.tenant((tx) => updateAutomation(tx, M1.staffCtx, "WELCOME", { message: "Bonjour {nom} !" }))).rejects.toMatchObject({ code: "UNKNOWN_VARIABLE" });
    await expect(M1.tenant((tx) => updateAutomation(tx, M1.staffCtx, "REVIEW_REQUEST", { enabled: true }))).rejects.toMatchObject({ code: "REVIEW_URL_REQUIRED" });
  });

  it("relance des absents : SMS aux seuls clients d'accord, une fois, avec un cadeau au comptoir", async () => {
    const yes = await customer(M1, true);
    const no = await customer(M1, false);
    for (const id of [yes, no]) {
      for (const d of [80, 70, 60]) await M1.tenant((tx) => recordPurchase(tx, M1.staffCtx, { customerId: id, amountCents: 1000, occurredAt: new Date(TUESDAY.getTime() - d * DAY) }));
    }
    smsBox.sent.length = 0;
    const r1 = await runMerchantAutomations(M1.merchant.id, TUESDAY);
    expect(r1).toEqual([{ kind: "WIN_BACK", sent: 1, failed: 0 }]);
    expect(smsBox.sent).toHaveLength(1);
    expect(smsBox.sent[0].text).toContain("cela fait un moment");
    expect((await M1.tenant((tx) => activeOffers(tx, yes, TUESDAY)))[0]?.title).toBe("Un croissant offert");
    expect(await M1.tenant((tx) => activeOffers(tx, no, TUESDAY))).toEqual([]);
    // Second passage du pilote : rien de nouveau
    expect(await runMerchantAutomations(M1.merchant.id, new Date(TUESDAY.getTime() + 3600_000))).toEqual([]);
  });

  it("rien la nuit ni le dimanche", async () => {
    expect(await runMerchantAutomations(M1.merchant.id, new Date("2026-11-17T22:00:00Z"))).toEqual([]);
    expect(await runMerchantAutomations(M1.merchant.id, new Date("2026-11-22T10:00:00Z"))).toEqual([]);
  });

  it("résultats sur 30 jours dans la liste des automatismes", async () => {
    const list = await M1.tenant((tx) => listAutomations(tx, M1.merchant.id));
    expect(list.find((a) => a.kind === "WIN_BACK")?.last30.sent).toBe(1);
  });

  it("un autre commerce ne voit pas ces réglages", async () => {
    const other = await makeMerchant("Autre");
    expect(await other.tenant((tx) => tx.automation.count())).toBe(0);
  });
});
