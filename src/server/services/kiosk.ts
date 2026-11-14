import type { Tx } from "../db";
import type { Ctx } from "../context";
import { AppError, badRequest, forbidden, notFound } from "../errors";
import { audit } from "../audit";
import { normalizePhone } from "../phone";
import { addSeconds } from "../time";
import { TECH } from "@/config/product";
import { getRules } from "./rules";
import {
  checkPin,
  checkVerificationCode,
  customerSummary,
  enrollCustomer,
  findCustomerByPhone,
  isPinLocked,
  revealPhone,
  sendVerificationCode,
  setPin,
  validatePin,
  type EnrollInput,
} from "./customers";
import { hasSpunToday } from "./wheel";
import { PURCHASE_BONUS_TYPES } from "./points";

const ttl = () => addSeconds(new Date(), TECH.kioskSessionTtlSeconds);
const OPEN = ["AWAITING_AUTH", "IDENTIFIED"] as const;

function deviceOf(ctx: Ctx) {
  if (ctx.actor.type !== "DEVICE") throw forbidden();
  return ctx.actor.deviceId;
}

async function closeOpenSessions(tx: Tx, deviceId: string) {
  await tx.kioskSession.updateMany({ where: { deviceId, status: { in: [...OPEN] } }, data: { status: "CANCELED" } });
}

async function loadSession(tx: Tx, ctx: Ctx, sessionId: string) {
  const s = await tx.kioskSession.findUnique({ where: { id: sessionId }, include: { customer: true } });
  if (!s || (ctx.actor.type === "DEVICE" && s.deviceId !== ctx.actor.deviceId)) throw notFound("Passage");
  if ((OPEN as readonly string[]).includes(s.status) && s.expiresAt < new Date()) {
    await tx.kioskSession.update({ where: { id: s.id }, data: { status: "EXPIRED" } });
    throw new AppError(410, "SESSION_EXPIRED", "Session expirée, recommencez");
  }
  return s;
}

/**
 * Étape 1 : le client tape son numéro. On ne révèle rien sur la personne
 * tant qu'elle n'est pas authentifiée (PIN ou validation vendeur).
 */
export async function startKioskSession(tx: Tx, ctx: Ctx, phone: string) {
  const deviceId = deviceOf(ctx);
  const e164 = normalizePhone(phone);
  await closeOpenSessions(tx, deviceId);
  const customer = await findCustomerByPhone(tx, ctx.merchantId, e164);
  if (!customer || !customer.phoneVerifiedAt) return { kind: "NEW" as const };

  const rules = await getRules(tx, ctx.merchantId);
  const authMethod = rules.identificationMode === "PIN" && customer.pinHash && !isPinLocked(customer) ? "PIN" : "STAFF_VALIDATION";
  const s = await tx.kioskSession.create({
    data: { merchantId: ctx.merchantId, deviceId, customerId: customer.id, status: "AWAITING_AUTH", authMethod, expiresAt: ttl() },
  });
  return { kind: "KNOWN" as const, sessionId: s.id, authMethod };
}

export async function submitKioskPin(tx: Tx, ctx: Ctx, sessionId: string, pin: string) {
  const s = await loadSession(tx, ctx, sessionId);
  if (s.status !== "AWAITING_AUTH" || !s.customer) throw badRequest("SESSION_STATE", "Étape invalide");
  const rules = await getRules(tx, ctx.merchantId);
  const r = await checkPin(tx, rules, s.customer, pin);
  if (!r.ok) {
    if (r.locked) {
      // Repli : le vendeur valide l'identité
      await tx.kioskSession.update({ where: { id: s.id }, data: { authMethod: "STAFF_VALIDATION" } });
      await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "customer.pin_locked", entityType: "customer", entityId: s.customer.id });
    }
    return { ok: false as const, locked: r.locked, remaining: r.remaining };
  }
  await tx.kioskSession.update({ where: { id: s.id }, data: { status: "IDENTIFIED", identifiedAt: new Date(), expiresAt: ttl() } });
  return { ok: true as const };
}

/** Nouveau client : inscription + envoi du code SMS. */
export async function enrollFromKiosk(tx: Tx, ctx: Ctx, input: EnrollInput) {
  const deviceId = deviceOf(ctx);
  await closeOpenSessions(tx, deviceId);
  const customer = await enrollCustomer(tx, ctx, input);
  const s = await tx.kioskSession.create({
    data: { merchantId: ctx.merchantId, deviceId, customerId: customer.id, status: "AWAITING_AUTH", expiresAt: ttl() },
  });
  return { sessionId: s.id };
}

/** « Code oublié » : renvoie un SMS ; le client choisira un nouveau PIN. */
export async function requestPinReset(tx: Tx, ctx: Ctx, sessionId: string) {
  const s = await loadSession(tx, ctx, sessionId);
  if (s.status !== "AWAITING_AUTH" || !s.customer) throw badRequest("SESSION_STATE", "Étape invalide");
  const phone = await revealPhone(tx, s.customer.id);
  if (!phone) throw notFound("Client");
  await sendVerificationCode(tx, ctx.merchantId, phone);
  await tx.kioskSession.update({ where: { id: s.id }, data: { authMethod: null, expiresAt: ttl() } });
}

/** Code SMS reçu (+ nouveau PIN si le commerce utilise le PIN). */
export async function verifyKioskCode(tx: Tx, ctx: Ctx, sessionId: string, code: string, pin?: string | null) {
  const s = await loadSession(tx, ctx, sessionId);
  if (s.status !== "AWAITING_AUTH" || !s.customer) throw badRequest("SESSION_STATE", "Étape invalide");
  const rules = await getRules(tx, ctx.merchantId);
  if (rules.identificationMode === "PIN") {
    if (!pin) throw badRequest("PIN_REQUIRED", "Choisissez un code à 4 chiffres");
    validatePin(pin); // avant de consommer le code SMS
  }
  const r = await checkVerificationCode(tx, ctx.merchantId, s.customer.id, code);
  if (!r.ok) return r;
  const wasNew = !s.customer.phoneVerifiedAt;
  await tx.customer.update({ where: { id: s.customer.id }, data: { phoneVerifiedAt: s.customer.phoneVerifiedAt ?? new Date() } });
  if (pin) await setPin(tx, s.customer.id, pin);
  await tx.kioskSession.update({
    where: { id: s.id },
    data: { status: "IDENTIFIED", identifiedAt: new Date(), authMethod: pin ? "PIN" : "STAFF_VALIDATION", expiresAt: ttl() },
  });
  if (wasNew) await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "customer.enroll", entityType: "customer", entityId: s.customer.id });
  return { ok: true as const };
}

/** Le vendeur confirme l'identité du client depuis la caisse. */
export async function staffValidateSession(tx: Tx, ctx: Ctx, sessionId: string) {
  if (ctx.actor.type !== "USER") throw forbidden();
  const s = await loadSession(tx, ctx, sessionId);
  if (s.status !== "AWAITING_AUTH" || !s.customer?.phoneVerifiedAt) throw badRequest("SESSION_STATE", "Ce passage ne peut pas être validé");
  await tx.customer.update({ where: { id: s.customer.id }, data: { pinFailedAttempts: 0, pinLockedUntil: null } });
  await tx.kioskSession.update({ where: { id: s.id }, data: { status: "IDENTIFIED", identifiedAt: new Date(), authMethod: "STAFF_VALIDATION", expiresAt: ttl() } });
  await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "kiosk.staff_validate", entityType: "kiosk_session", entityId: s.id });
}

export async function cancelKioskSession(tx: Tx, ctx: Ctx, sessionId: string) {
  const s = await tx.kioskSession.findUnique({ where: { id: sessionId } });
  if (!s || (ctx.actor.type === "DEVICE" && s.deviceId !== ctx.actor.deviceId)) throw notFound("Passage");
  if ((OPEN as readonly string[]).includes(s.status)) {
    await tx.kioskSession.update({ where: { id: s.id }, data: { status: "CANCELED" } });
  }
}

/** Ce que la tablette affiche. Les données client n'apparaissent qu'une fois l'identité confirmée. */
export async function kioskSessionView(tx: Tx, ctx: Ctx, sessionId: string) {
  const s = await loadSession(tx, ctx, sessionId);
  const base = { sessionId: s.id, status: s.status, authMethod: s.authMethod, phoneVerified: !!s.customer?.phoneVerifiedAt };
  if (!s.customer || !["IDENTIFIED", "COMPLETED"].includes(s.status)) return { ...base, customer: null, purchase: null, wheel: null };

  const summary = await customerSummary(tx, s.customer.id);
  let purchase = null;
  let wheel = null;
  if (s.status === "COMPLETED") {
    const txs = await tx.pointTransaction.findMany({ where: { kioskSessionId: s.id, type: { in: ["EARN", ...PURCHASE_BONUS_TYPES] } } });
    purchase = {
      earned: txs.reduce((a, t) => a + t.points, 0),
      bonus: txs.filter((t) => t.type === "TIER_BONUS").reduce((a, t) => a + t.points, 0),
      bonuses: txs.filter((t) => t.type !== "EARN" && t.type !== "TIER_BONUS").map((t) => ({ type: t.type, points: t.points })),
    };
    const rules = await getRules(tx, ctx.merchantId);
    if (rules.wheelEnabled) {
      const spin = await hasSpunToday(tx, ctx.merchantId, s.customer.id);
      const prizes = await tx.wheelPrize.findMany({ where: { merchantId: ctx.merchantId, active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, label: true } });
      wheel = { available: !spin && prizes.length >= 2, prizes, lastPrize: spin?.prizeLabel ?? null };
    }
  }
  return { ...base, customer: summary, purchase, wheel };
}

/** Pour la caisse : passages en cours sur les tablettes du magasin. */
export async function activeKioskSessions(tx: Tx, merchantId: string) {
  const sessions = await tx.kioskSession.findMany({
    where: { merchantId, status: { in: [...OPEN] }, expiresAt: { gt: new Date() }, customer: { phoneVerifiedAt: { not: null } } },
    include: { device: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return Promise.all(
    sessions.map(async (s) => ({
      sessionId: s.id,
      status: s.status,
      authMethod: s.authMethod,
      deviceName: s.device.name,
      createdAt: s.createdAt,
      customer: await customerSummary(tx, s.customerId!),
    })),
  );
}
