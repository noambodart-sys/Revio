import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { disconnectAll, systemDb } from "@/server/db";
import { enrollFromKiosk, kioskSessionView, setKioskMarketing, startKioskSession, verifyKioskCode } from "@/server/services/kiosk";
import { addMember, listTeam, updateMember } from "@/server/services/team";
import { counterPurchase, counterRedeem, counterValidateIdentity, issueStaffToken, staffUnlock } from "@/server/services/counter";
import { currentConsents } from "@/server/services/consents";
import { login } from "@/server/services/auth";
import { captureSms, makeMerchant, resetDb } from "../helpers";

type M = Awaited<ReturnType<typeof makeMerchant>>;
const smsBox = captureSms();
let M1: M;
let sessionId: string;
let customerId: string;

beforeAll(async () => {
  await resetDb();
  M1 = await makeMerchant("Boulangerie");
  const e = await M1.tenant((tx) => enrollFromKiosk(tx, M1.deviceCtx, { phone: "0470700001", firstName: "Léa", acceptTerms: true, confirmAge16: true, marketingSms: false, marketingEmail: false }));
  await M1.tenant((tx) => verifyKioskCode(tx, M1.deviceCtx, e.sessionId, smsBox.lastCode(), "4821"));
  sessionId = e.sessionId;
  customerId = (await M1.tenant((tx) => tx.kioskSession.findUniqueOrThrow({ where: { id: e.sessionId } }))).customerId!;
});
afterAll(disconnectAll);

describe("équipe", () => {
  it("vendeur avec un simple code, sans e-mail ; codes uniques", async () => {
    await M1.tenant((tx) => addMember(tx, M1.staffCtx, { displayName: "Sam", role: "STAFF", pin: "2580" }));
    await expect(M1.tenant((tx) => addMember(tx, M1.staffCtx, { displayName: "Zoé", role: "STAFF", pin: "2580" }))).rejects.toMatchObject({ code: "STAFF_PIN_TAKEN" });
    await expect(M1.tenant((tx) => addMember(tx, M1.staffCtx, { displayName: "Zoé", role: "STAFF", pin: "1234" }))).rejects.toMatchObject({ code: "WEAK_STAFF_PIN" });
    await expect(M1.tenant((tx) => addMember(tx, M1.staffCtx, { displayName: "Zoé", role: "STAFF" }))).rejects.toMatchObject({ code: "NEED_ACCESS" });
    const team = await M1.tenant((tx) => listTeam(tx, M1.merchant.id));
    expect(team.find((t) => t.displayName === "Sam")).toMatchObject({ hasPin: true, hasLogin: false, role: "STAFF" });
  });

  it("vendeur avec e-mail : peut se connecter à la caisse", async () => {
    await M1.tenant((tx) => addMember(tx, M1.staffCtx, { displayName: "Noa", role: "STAFF", email: "noa@test.local", password: "mot-de-passe-noa" }));
    expect((await login("noa@test.local", "mot-de-passe-noa")).user.role).toBe("STAFF");
  });

  it("on ne peut pas retirer le dernier propriétaire ni se désactiver soi-même", async () => {
    await expect(M1.tenant((tx) => updateMember(tx, M1.staffCtx, M1.owner.id, { disabled: true }))).rejects.toMatchObject({ status: 403 });
  });

  it("un autre commerce ne voit ni ne modifie l'équipe", async () => {
    const other = await makeMerchant("Autre");
    const team = await other.tenant((tx) => listTeam(tx, other.merchant.id));
    expect(team.map((t) => t.displayName)).not.toContain("Sam");
    const sam = await systemDb().user.findFirstOrThrow({ where: { displayName: "Sam", merchantId: M1.merchant.id } });
    await expect(other.tenant((tx) => updateMember(tx, other.staffCtx, sam.id, { displayName: "Pirate" }))).rejects.toMatchObject({ status: 404 });
  });
});

describe("mode comptoir (encaissement sur la tablette)", () => {
  it("code faux : refusé et audité", async () => {
    const r = await M1.tenant((tx) => staffUnlock(tx, M1.deviceCtx, sessionId, "9999"));
    expect(r.ok).toBe(false);
    expect(await systemDb().auditLog.count({ where: { action: "kiosk.staff_pin_failed", merchantId: M1.merchant.id } })).toBe(1);
  });

  it("code juste : achat enregistré au nom du vendeur, résultat sur la tablette", async () => {
    const r = await M1.tenant((tx) => staffUnlock(tx, M1.deviceCtx, sessionId, "2580"));
    if (!r.ok) throw new Error("code refusé");
    expect(r.staffName).toBe("Sam");
    const p = await M1.tenant((tx) => counterPurchase(tx, M1.deviceCtx, sessionId, r.token, 1500));
    expect(p.earned).toBe(15);
    const t = await M1.tenant((tx) => tx.pointTransaction.findFirstOrThrow({ where: { id: p.transactionId }, include: { staffUser: true } }));
    expect(t.staffUser?.displayName).toBe("Sam");
    const view = await M1.tenant((tx) => kioskSessionView(tx, M1.deviceCtx, sessionId));
    expect(view.status).toBe("COMPLETED");
  });

  it("jeton refusé sur un autre passage, expiré, ou falsifié", async () => {
    const sam = await systemDb().user.findFirstOrThrow({ where: { displayName: "Sam", merchantId: M1.merchant.id } });
    const start = await M1.tenant((tx) => startKioskSession(tx, M1.deviceCtx, "0470700001"));
    if (start.kind !== "KNOWN") throw new Error();
    const forOld = issueStaffToken(sam.id, sessionId);
    await expect(M1.tenant((tx) => counterPurchase(tx, M1.deviceCtx, start.sessionId, forOld, 100))).rejects.toMatchObject({ code: "STAFF_TOKEN_INVALID" });
    const expired = issueStaffToken(sam.id, start.sessionId, Date.now() - 10 * 60_000);
    await expect(M1.tenant((tx) => counterPurchase(tx, M1.deviceCtx, start.sessionId, expired, 100))).rejects.toMatchObject({ code: "STAFF_TOKEN_INVALID" });
    const forged = issueStaffToken(sam.id, start.sessionId).replace(/.$/, "x");
    await expect(M1.tenant((tx) => counterPurchase(tx, M1.deviceCtx, start.sessionId, forged, 100))).rejects.toMatchObject({ code: "STAFF_TOKEN_INVALID" });
  });

  it("le vendeur confirme l'identité puis remet une récompense", async () => {
    const start = await M1.tenant((tx) => startKioskSession(tx, M1.deviceCtx, "0470700001"));
    if (start.kind !== "KNOWN") throw new Error();
    const r = await M1.tenant((tx) => staffUnlock(tx, M1.deviceCtx, start.sessionId, "2580"));
    if (!r.ok) throw new Error();
    await M1.tenant((tx) => counterValidateIdentity(tx, M1.deviceCtx, start.sessionId, r.token));
    const reward = await M1.tenant((tx) => tx.reward.create({ data: { merchantId: M1.merchant.id, name: "Croissant", pointsCost: 10 } }));
    const red = await M1.tenant((tx) => counterRedeem(tx, M1.deviceCtx, start.sessionId, r.token, reward.id));
    expect(red.balance).toBe(5);
  });

  it("un vendeur désactivé ne peut plus encaisser", async () => {
    const sam = await systemDb().user.findFirstOrThrow({ where: { displayName: "Sam", merchantId: M1.merchant.id } });
    const start = await M1.tenant((tx) => startKioskSession(tx, M1.deviceCtx, "0470700001"));
    if (start.kind !== "KNOWN") throw new Error();
    const token = issueStaffToken(sam.id, start.sessionId);
    await M1.tenant((tx) => updateMember(tx, M1.staffCtx, sam.id, { disabled: true }));
    await expect(M1.tenant((tx) => counterValidateIdentity(tx, M1.deviceCtx, start.sessionId, token))).rejects.toMatchObject({ code: "STAFF_TOKEN_INVALID" });
    expect((await M1.tenant((tx) => staffUnlock(tx, M1.deviceCtx, start.sessionId, "2580"))).ok).toBe(false);
  });
});

describe("préférences du client sur la tablette", () => {
  it("le client active lui-même les offres par SMS (nouveau consentement tracé)", async () => {
    expect((await M1.tenant((tx) => currentConsents(tx, customerId))).MARKETING_SMS).toBe(false);
    await M1.tenant((tx) => setKioskMarketing(tx, M1.deviceCtx, sessionId, true));
    expect((await M1.tenant((tx) => currentConsents(tx, customerId))).MARKETING_SMS).toBe(true);
    const rows = await M1.tenant((tx) => tx.consent.findMany({ where: { customerId, type: "MARKETING_SMS" } }));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.textVersion)).toBe(true);
  });
});
