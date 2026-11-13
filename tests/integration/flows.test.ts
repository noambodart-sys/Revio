import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { disconnectAll, systemDb } from "@/server/db";
import {
  enrollFromKiosk,
  kioskSessionView,
  requestPinReset,
  staffValidateSession,
  startKioskSession,
  submitKioskPin,
  verifyKioskCode,
  activeKioskSessions,
} from "@/server/services/kiosk";
import { adjustPoints, expireInactivePoints, getBalance, recordPurchase } from "@/server/services/points";
import { cancelRedemption, redeemReward } from "@/server/services/rewards";
import { spinWheel } from "@/server/services/wheel";
import { currentConsents } from "@/server/services/consents";
import { applyRetention, eraseCustomer, exportCustomerData, optOutMarketing, rectifyCustomer } from "@/server/services/gdpr";
import { runDailyJobs } from "@/server/services/jobs";
import { login, getSessionUser } from "@/server/services/auth";
import { setMerchantSuspended } from "@/server/services/merchants";
import { authenticateDevice, createPairingCode, pairDevice, revokeDevice } from "@/server/services/devices";
import { captureSms, makeMerchant, resetDb, SYSTEM } from "../helpers";

type M = Awaited<ReturnType<typeof makeMerchant>>;
let M1: M;
const smsBox = captureSms();

async function enrollAndVerify(m: M, phone: string, pin = "4821") {
  const { sessionId } = await m.tenant((tx) =>
    enrollFromKiosk(tx, m.deviceCtx, { phone, firstName: "Léa", acceptTerms: true, confirmAge16: true, marketingSms: true, marketingEmail: false }),
  );
  const r = await m.tenant((tx) => verifyKioskCode(tx, m.deviceCtx, sessionId, smsBox.lastCode(), pin));
  expect(r.ok).toBe(true);
  const s = await m.tenant((tx) => tx.kioskSession.findUniqueOrThrow({ where: { id: sessionId } }));
  return { sessionId, customerId: s.customerId! };
}

beforeAll(async () => {
  await resetDb();
  smsBox.sent.length = 0;
});
beforeEach(async () => {
  M1 = await makeMerchant("Boulangerie");
});
afterAll(disconnectAll);

describe("inscription sur la tablette", () => {
  it("parcours complet : inscription, SMS, PIN, consentements séparés", async () => {
    const { customerId, sessionId } = await enrollAndVerify(M1, "0470 12 34 56");
    expect(smsBox.sent.at(-1)!.to).toBe("+32470123456");

    const view = await M1.tenant((tx) => kioskSessionView(tx, M1.deviceCtx, sessionId));
    expect(view.status).toBe("IDENTIFIED");
    expect(view.customer?.firstName).toBe("Léa");
    expect(view.customer?.maskedPhone).toBe("+32 4•• •• •• 56");

    const consents = await M1.tenant((tx) => currentConsents(tx, customerId));
    expect(consents).toEqual({ TERMS: true, AGE_16_PLUS: true, MARKETING_SMS: true, MARKETING_EMAIL: false });
    const rows = await M1.tenant((tx) => tx.consent.findMany({ where: { customerId } }));
    expect(rows.every((r) => r.textVersion && r.legalDocumentId && r.deviceId === M1.deviceId)).toBe(true);

    // Le numéro n'est jamais stocké en clair
    const ident = await systemDb().customerIdentifier.findFirstOrThrow({ where: { customerId } });
    expect(Buffer.from(ident.valueEnc).toString("latin1")).not.toContain("470123456");
    expect(ident.lookupHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuse sans CGU ou sans confirmation d'âge", async () => {
    await expect(
      M1.tenant((tx) => enrollFromKiosk(tx, M1.deviceCtx, { phone: "0470000001", acceptTerms: false, confirmAge16: true, marketingSms: false, marketingEmail: false })),
    ).rejects.toMatchObject({ code: "TERMS_REQUIRED" });
    await expect(
      M1.tenant((tx) => enrollFromKiosk(tx, M1.deviceCtx, { phone: "0470000001", acceptTerms: true, confirmAge16: false, marketingSms: false, marketingEmail: false })),
    ).rejects.toMatchObject({ code: "AGE_REQUIRED" });
  });

  it("mauvais code SMS : compté, puis bloqué après 5 essais", async () => {
    const { sessionId } = await M1.tenant((tx) =>
      enrollFromKiosk(tx, M1.deviceCtx, { phone: "0470000002", acceptTerms: true, confirmAge16: true, marketingSms: false, marketingEmail: false }),
    );
    const good = smsBox.lastCode();
    const bad = good === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      const r = await M1.tenant((tx) => verifyKioskCode(tx, M1.deviceCtx, sessionId, bad, "4821"));
      expect(r.ok).toBe(false);
    }
    const r = await M1.tenant((tx) => verifyKioskCode(tx, M1.deviceCtx, sessionId, good, "4821"));
    expect(r).toMatchObject({ ok: false, reason: "EXPIRED" });
  });

  it("numéro déjà inscrit : pas de double compte", async () => {
    await enrollAndVerify(M1, "0470000003");
    await expect(
      M1.tenant((tx) => enrollFromKiosk(tx, M1.deviceCtx, { phone: "+32470000003", acceptTerms: true, confirmAge16: true, marketingSms: false, marketingEmail: false })),
    ).rejects.toMatchObject({ code: "ALREADY_ENROLLED" });
  });
});

describe("client connu", () => {
  it("PIN correct → identifié ; rien n'est révélé avant", async () => {
    await enrollAndVerify(M1, "0470000010");
    const start = await M1.tenant((tx) => startKioskSession(tx, M1.deviceCtx, "0470000010"));
    expect(start).toMatchObject({ kind: "KNOWN", authMethod: "PIN" });
    if (start.kind !== "KNOWN") throw new Error();
    const before = await M1.tenant((tx) => kioskSessionView(tx, M1.deviceCtx, start.sessionId));
    expect(before.customer).toBeNull();
    expect((await M1.tenant((tx) => submitKioskPin(tx, M1.deviceCtx, start.sessionId, "4821"))).ok).toBe(true);
    const after = await M1.tenant((tx) => kioskSessionView(tx, M1.deviceCtx, start.sessionId));
    expect(after.customer?.firstName).toBe("Léa");
  });

  it("numéro inconnu → inscription", async () => {
    expect(await M1.tenant((tx) => startKioskSession(tx, M1.deviceCtx, "0470999999"))).toEqual({ kind: "NEW" });
  });

  it("5 PIN faux → blocage, repli sur validation vendeur qui débloque", async () => {
    const { customerId } = await enrollAndVerify(M1, "0470000011");
    const start = await M1.tenant((tx) => startKioskSession(tx, M1.deviceCtx, "0470000011"));
    if (start.kind !== "KNOWN") throw new Error();
    let last;
    for (let i = 0; i < 5; i++) last = await M1.tenant((tx) => submitKioskPin(tx, M1.deviceCtx, start.sessionId, "9999"));
    expect(last).toMatchObject({ ok: false, locked: true });
    // Même le bon PIN est refusé pendant le blocage
    expect((await M1.tenant((tx) => submitKioskPin(tx, M1.deviceCtx, start.sessionId, "4821"))).ok).toBe(false);
    // Nouveau passage : la tablette demande directement la validation vendeur
    const again = await M1.tenant((tx) => startKioskSession(tx, M1.deviceCtx, "0470000011"));
    expect(again).toMatchObject({ authMethod: "STAFF_VALIDATION" });
    if (again.kind !== "KNOWN") throw new Error();
    const pending = await M1.tenant((tx) => activeKioskSessions(tx, M1.merchant.id));
    expect(pending[0].customer.maskedPhone).toBe("+32 4•• •• •• 11");
    await M1.tenant((tx) => staffValidateSession(tx, M1.staffCtx, again.sessionId));
    const c = await systemDb().customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(c.pinLockedUntil).toBeNull();
  });

  it("PIN oublié : nouveau code SMS et nouveau PIN", async () => {
    await enrollAndVerify(M1, "0470000012");
    const start = await M1.tenant((tx) => startKioskSession(tx, M1.deviceCtx, "0470000012"));
    if (start.kind !== "KNOWN") throw new Error();
    await M1.tenant((tx) => requestPinReset(tx, M1.deviceCtx, start.sessionId));
    expect((await M1.tenant((tx) => verifyKioskCode(tx, M1.deviceCtx, start.sessionId, smsBox.lastCode(), "7351"))).ok).toBe(true);
    const s2 = await M1.tenant((tx) => startKioskSession(tx, M1.deviceCtx, "0470000012"));
    if (s2.kind !== "KNOWN") throw new Error();
    expect((await M1.tenant((tx) => submitKioskPin(tx, M1.deviceCtx, s2.sessionId, "7351"))).ok).toBe(true);
  });

  it("une tablette ne peut pas lire la session d'une autre tablette", async () => {
    const { sessionId } = await enrollAndVerify(M1, "0470000013");
    const other = await createPairingCode(systemDb(), SYSTEM, M1.merchant.id, "Autre");
    const { deviceId } = await pairDevice(systemDb(), other.code);
    await expect(
      M1.tenant((tx) => kioskSessionView(tx, { merchantId: M1.merchant.id, actor: { type: "DEVICE", deviceId } }, sessionId)),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("caisse : points, niveaux, récompenses", () => {
  it("achat → points, solde = somme des mouvements, passage terminé", async () => {
    const { customerId, sessionId } = await enrollAndVerify(M1, "0470000020");
    const r = await M1.tenant((tx) => recordPurchase(tx, M1.staffCtx, { customerId, amountCents: 1299, kioskSessionId: sessionId }));
    expect(r).toMatchObject({ earned: 12, balance: 12, replayed: false });
    const view = await M1.tenant((tx) => kioskSessionView(tx, M1.deviceCtx, sessionId));
    expect(view.status).toBe("COMPLETED");
    expect(view.purchase?.earned).toBe(12);
  });

  it("niveau Argent atteint → bonus +5 % sur l'achat suivant (ligne séparée)", async () => {
    const { customerId } = await enrollAndVerify(M1, "0470000021");
    await M1.tenant((tx) => tx.rules.update({ where: { merchantId: M1.merchant.id }, data: { dailyPointsCap: null } }));
    const r1 = await M1.tenant((tx) => recordPurchase(tx, M1.staffCtx, { customerId, amountCents: 30000 }));
    expect(r1.tier?.name).toBe("Argent");
    const r2 = await M1.tenant((tx) => recordPurchase(tx, M1.staffCtx, { customerId, amountCents: 10000 }));
    expect(r2).toMatchObject({ basePoints: 100, bonusPoints: 5, earned: 105, balance: 405 });
    const types = await M1.tenant((tx) => tx.pointTransaction.findMany({ where: { customerId }, select: { type: true } }));
    expect(types.map((t) => t.type).sort()).toEqual(["EARN", "EARN", "TIER_BONUS"]);
  });

  it("plafond quotidien anti-fraude + alerte dans l'audit", async () => {
    const { customerId } = await enrollAndVerify(M1, "0470000022");
    const r = await M1.tenant((tx) => recordPurchase(tx, M1.staffCtx, { customerId, amountCents: 80000 }));
    expect(r).toMatchObject({ earned: 500, capped: true });
    const r2 = await M1.tenant((tx) => recordPurchase(tx, M1.staffCtx, { customerId, amountCents: 1000 }));
    expect(r2.earned).toBe(0);
    const alerts = await systemDb().auditLog.count({ where: { merchantId: M1.merchant.id, action: "fraud.daily_cap_reached" } });
    expect(alerts).toBe(2);
  });

  it("resynchronisation hors-ligne : même clé = un seul crédit", async () => {
    const { customerId } = await enrollAndVerify(M1, "0470000023");
    const key = "offline-abc-123";
    const a = await M1.tenant((tx) => recordPurchase(tx, M1.staffCtx, { customerId, amountCents: 2000, idempotencyKey: key }));
    const b = await M1.tenant((tx) => recordPurchase(tx, M1.staffCtx, { customerId, amountCents: 2000, idempotencyKey: key }));
    expect(b.replayed).toBe(true);
    expect(b.transactionId).toBe(a.transactionId);
    expect(await M1.tenant((tx) => getBalance(tx, customerId))).toBe(20);
  });

  it("récompense : solde vérifié, stock décrémenté, annulation par mouvement inverse", async () => {
    const { customerId } = await enrollAndVerify(M1, "0470000024");
    const reward = await M1.tenant((tx) => tx.reward.create({ data: { merchantId: M1.merchant.id, name: "Café", pointsCost: 100, stock: 1 } }));
    await expect(M1.tenant((tx) => redeemReward(tx, M1.staffCtx, { customerId, rewardId: reward.id }))).rejects.toMatchObject({ code: "INSUFFICIENT_POINTS" });
    await M1.tenant((tx) => recordPurchase(tx, M1.staffCtx, { customerId, amountCents: 25000 }));
    const r = await M1.tenant((tx) => redeemReward(tx, M1.staffCtx, { customerId, rewardId: reward.id }));
    expect(r.balance).toBe(150);
    await expect(M1.tenant((tx) => redeemReward(tx, M1.staffCtx, { customerId, rewardId: reward.id }))).rejects.toMatchObject({ code: "OUT_OF_STOCK" });
    await M1.tenant((tx) => cancelRedemption(tx, M1.staffCtx, r.redemptionId, "Erreur de caisse"));
    expect(await M1.tenant((tx) => getBalance(tx, customerId))).toBe(250);
  });

  it("deux remises simultanées ne dépensent pas deux fois le même solde", async () => {
    const { customerId } = await enrollAndVerify(M1, "0470000025");
    const reward = await M1.tenant((tx) => tx.reward.create({ data: { merchantId: M1.merchant.id, name: "Café", pointsCost: 100 } }));
    await M1.tenant((tx) => recordPurchase(tx, M1.staffCtx, { customerId, amountCents: 15000 }));
    const results = await Promise.allSettled([
      M1.tenant((tx) => redeemReward(tx, M1.staffCtx, { customerId, rewardId: reward.id })),
      M1.tenant((tx) => redeemReward(tx, M1.staffCtx, { customerId, rewardId: reward.id })),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await M1.tenant((tx) => getBalance(tx, customerId))).toBe(50);
  });

  it("correction : motif obligatoire, audit, solde jamais négatif, alerte au-delà du seuil", async () => {
    const { customerId } = await enrollAndVerify(M1, "0470000026");
    await expect(M1.tenant((tx) => adjustPoints(tx, M1.staffCtx, { customerId, points: 10, reason: " " }))).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await expect(M1.tenant((tx) => adjustPoints(tx, M1.staffCtx, { customerId, points: -10, reason: "Erreur" }))).rejects.toMatchObject({ code: "NEGATIVE_BALANCE" });
    await M1.tenant((tx) => tx.rules.update({ where: { merchantId: M1.merchant.id }, data: { adjustmentAlertDailyCount: 2 } }));
    const a = await M1.tenant((tx) => adjustPoints(tx, M1.staffCtx, { customerId, points: 10, reason: "Oubli carte" }));
    const b = await M1.tenant((tx) => adjustPoints(tx, M1.staffCtx, { customerId, points: 10, reason: "Oubli carte" }));
    expect([a.alert, b.alert]).toEqual([false, true]);
    expect(await systemDb().auditLog.count({ where: { merchantId: M1.merchant.id, action: "points.adjust" } })).toBe(2);
  });
});

describe("roue", () => {
  it("après un achat, une fois par jour, tirage côté serveur", async () => {
    const { customerId, sessionId } = await enrollAndVerify(M1, "0470000030");
    await M1.tenant(async (tx) => {
      await tx.rules.update({ where: { merchantId: M1.merchant.id }, data: { wheelEnabled: true } });
      await tx.wheelPrize.createMany({
        data: [
          { merchantId: M1.merchant.id, label: "+5", type: "POINTS", points: 5, weight: 1 },
          { merchantId: M1.merchant.id, label: "+10", type: "POINTS", points: 10, weight: 1 },
        ],
      });
    });
    await expect(M1.tenant((tx) => spinWheel(tx, M1.deviceCtx, { customerId, kioskSessionId: sessionId }))).rejects.toMatchObject({ code: "WHEEL_NOT_ALLOWED" });
    await M1.tenant((tx) => recordPurchase(tx, M1.staffCtx, { customerId, amountCents: 1000, kioskSessionId: sessionId }));
    const spin = await M1.tenant((tx) => spinWheel(tx, M1.deviceCtx, { customerId, kioskSessionId: sessionId }));
    expect([15, 20]).toContain(spin.balance);
    await expect(M1.tenant((tx) => spinWheel(tx, M1.deviceCtx, { customerId, kioskSessionId: sessionId }))).rejects.toMatchObject({ code: "WHEEL_ALREADY_SPUN" });
  });

  it("désactivée par défaut", async () => {
    const r = await M1.tenant((tx) => tx.rules.findUniqueOrThrow({ where: { merchantId: M1.merchant.id } }));
    expect(r.wheelEnabled).toBe(false);
  });
});

describe("RGPD", () => {
  it("export complet, avec le numéro en clair, tracé dans l'audit", async () => {
    const { customerId } = await enrollAndVerify(M1, "0470000040");
    await M1.tenant((tx) => recordPurchase(tx, M1.staffCtx, { customerId, amountCents: 500 }));
    const data = await M1.tenant((tx) => exportCustomerData(tx, M1.staffCtx, customerId));
    expect(data.customer.phone).toBe("+32470000040");
    expect(data.consents).toHaveLength(4);
    expect(data.pointTransactions).toHaveLength(1);
    expect(await systemDb().auditLog.count({ where: { action: "customer.export", entityId: customerId } })).toBe(1);
  });

  it("rectification du numéro", async () => {
    const { customerId } = await enrollAndVerify(M1, "0470000041");
    await M1.tenant((tx) => rectifyCustomer(tx, M1.staffCtx, customerId, { phone: "0470000042", firstName: "Léo" }));
    expect(await M1.tenant((tx) => startKioskSession(tx, M1.deviceCtx, "0470000041"))).toEqual({ kind: "NEW" });
    expect(await M1.tenant((tx) => startKioskSession(tx, M1.deviceCtx, "0470000042"))).toMatchObject({ kind: "KNOWN" });
  });

  it("désinscription marketing : nouveaux consentements à false, historique conservé", async () => {
    const { customerId } = await enrollAndVerify(M1, "0470000043");
    const state = await M1.tenant((tx) => optOutMarketing(tx, M1.staffCtx, customerId));
    expect(state.MARKETING_SMS).toBe(false);
    expect(await M1.tenant((tx) => tx.consent.count({ where: { customerId, type: "MARKETING_SMS" } }))).toBe(2);
  });

  it("effacement : plus aucune donnée identifiante, le numéro peut se réinscrire", async () => {
    const { customerId } = await enrollAndVerify(M1, "0470000044");
    await M1.tenant((tx) => recordPurchase(tx, M1.staffCtx, { customerId, amountCents: 500 }));
    await M1.tenant((tx) => eraseCustomer(tx, M1.staffCtx, customerId, "Demande du client"));
    const c = await systemDb().customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(c).toMatchObject({ firstName: null, pinHash: null });
    expect(c.anonymizedAt).not.toBeNull();
    expect(await systemDb().customerIdentifier.count({ where: { customerId } })).toBe(0);
    expect(await M1.tenant((tx) => startKioskSession(tx, M1.deviceCtx, "0470000044"))).toEqual({ kind: "NEW" });
    // Statistiques intactes
    expect(await systemDb().pointTransaction.count({ where: { customerId } })).toBe(1);
  });

  it("conservation : anonymisation après la durée d'inactivité, et des inscriptions non finalisées", async () => {
    const { customerId } = await enrollAndVerify(M1, "0470000045");
    await systemDb().customer.update({ where: { id: customerId }, data: { lastVisitAt: new Date("2023-01-01") } });
    await M1.tenant((tx) => enrollFromKiosk(tx, M1.deviceCtx, { phone: "0470000046", acceptTerms: true, confirmAge16: true, marketingSms: false, marketingEmail: false }));
    const future = new Date(Date.now() + 48 * 3600_000);
    const n = await M1.tenant((tx) => applyRetention(tx, { merchantId: M1.merchant.id, actor: { type: "SYSTEM" } }, future));
    expect(n).toBe(2);
  });
});

describe("jobs et expiration", () => {
  it("expiration des points après 12 mois sans visite", async () => {
    const { customerId } = await enrollAndVerify(M1, "0470000050");
    await M1.tenant((tx) => recordPurchase(tx, M1.staffCtx, { customerId, amountCents: 5000 }));
    const in13Months = new Date(Date.now() + 400 * 24 * 3600_000);
    expect(await M1.tenant((tx) => expireInactivePoints(tx, M1.merchant.id, in13Months))).toBe(1);
    expect(await M1.tenant((tx) => getBalance(tx, customerId))).toBe(0);
    expect(await M1.tenant((tx) => expireInactivePoints(tx, M1.merchant.id, in13Months))).toBe(0);
  });

  it("le job quotidien tourne pour tous les commerces", async () => {
    const report = await runDailyJobs();
    expect(report.length).toBeGreaterThanOrEqual(1);
  });
});

describe("comptes et appareils", () => {
  it("connexion, blocage après 5 échecs, suspension du commerce", async () => {
    const email = M1.owner.email;
    const ok = await login(email, "mot-de-passe-solide");
    expect((await getSessionUser(ok.token))?.merchantId).toBe(M1.merchant.id);
    for (let i = 0; i < 5; i++) await expect(login(email, "faux-mot-de-passe")).rejects.toMatchObject({ status: 401 });
    await expect(login(email, "mot-de-passe-solide")).rejects.toMatchObject({ code: "ACCOUNT_LOCKED" });
    await systemDb().user.update({ where: { id: M1.owner.id }, data: { lockedUntil: null } });
    await setMerchantSuspended(SYSTEM, M1.merchant.id, true);
    expect(await getSessionUser(ok.token)).toBeNull();
    await expect(login(email, "mot-de-passe-solide")).rejects.toMatchObject({ code: "MERCHANT_SUSPENDED" });
  });

  it("appairage à usage unique, révocation à distance", async () => {
    const p = await createPairingCode(systemDb(), SYSTEM, M1.merchant.id, "Comptoir");
    const { token, deviceId } = await pairDevice(systemDb(), p.code.toLowerCase());
    await expect(pairDevice(systemDb(), p.code)).rejects.toMatchObject({ code: "INVALID_CODE" });
    expect((await authenticateDevice(systemDb(), token))?.deviceId).toBe(deviceId);
    await revokeDevice(systemDb(), SYSTEM, deviceId);
    expect(await authenticateDevice(systemDb(), token)).toBeNull();
  });
});
