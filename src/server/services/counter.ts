import { createHmac } from "node:crypto";
import type { Tx } from "../db";
import type { Ctx } from "../context";
import { AppError, badRequest, forbidden, notFound } from "../errors";
import { audit } from "../audit";
import { safeEqual, verifySecret } from "../crypto";
import { env } from "../env";
import { recordPurchase } from "./points";
import { redeemReward } from "./rewards";
import { redeemOffer } from "./campaigns";
import { staffValidateSession } from "./kiosk";

/**
 * Mode comptoir : le vendeur encaisse directement sur la tablette avec son code vendeur.
 * Pour les commerces sans ordinateur au comptoir. Le code ouvre une autorisation courte,
 * liée à ce passage précis.
 */
const TOKEN_TTL_MS = 3 * 60_000;

function sign(payload: string) {
  return createHmac("sha256", Buffer.from(env().LOOKUP_HMAC_KEY, "base64")).update(`staff:${payload}`).digest("base64url");
}

export function issueStaffToken(userId: string, sessionId: string, now = Date.now()) {
  const payload = `${userId}.${sessionId}.${now + TOKEN_TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

export function readStaffToken(token: string, sessionId: string, now = Date.now()): string {
  const parts = token.split(".");
  if (parts.length !== 4) throw new AppError(401, "STAFF_TOKEN_INVALID", "Code vendeur à saisir à nouveau");
  const [userId, sid, exp, sig] = parts;
  if (!safeEqual(sig, sign(`${userId}.${sid}.${exp}`)) || sid !== sessionId || Number(exp) < now) {
    throw new AppError(401, "STAFF_TOKEN_INVALID", "Code vendeur à saisir à nouveau");
  }
  return userId;
}

async function loadSession(tx: Tx, ctx: Ctx, sessionId: string) {
  if (ctx.actor.type !== "DEVICE") throw forbidden();
  const s = await tx.kioskSession.findUnique({ where: { id: sessionId } });
  if (!s || s.deviceId !== ctx.actor.deviceId || !s.customerId) throw notFound("Passage");
  return s;
}

/** Vérifie le code vendeur. Ne lève pas d'exception en cas d'échec (l'échec doit être audité). */
export async function staffUnlock(tx: Tx, ctx: Ctx, sessionId: string, pin: string) {
  await loadSession(tx, ctx, sessionId);
  if (!/^\d{4,6}$/.test(pin)) return { ok: false as const };
  const staff = await tx.user.findMany({ where: { merchantId: ctx.merchantId, disabledAt: null, staffPinHash: { not: null } } });
  for (const u of staff) {
    if (await verifySecret(u.staffPinHash!, pin)) {
      return { ok: true as const, token: issueStaffToken(u.id, sessionId), staffName: u.displayName };
    }
  }
  await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "kiosk.staff_pin_failed", entityType: "kiosk_session", entityId: sessionId });
  return { ok: false as const };
}

/** Contexte « vendeur » pour les actions faites sur la tablette après saisie du code. */
async function staffCtx(tx: Tx, ctx: Ctx, sessionId: string, token: string): Promise<Ctx> {
  await loadSession(tx, ctx, sessionId);
  const userId = readStaffToken(token, sessionId);
  const u = await tx.user.findUnique({ where: { id: userId } });
  if (!u || u.disabledAt || u.merchantId !== ctx.merchantId) throw new AppError(401, "STAFF_TOKEN_INVALID", "Code vendeur à saisir à nouveau");
  return { merchantId: ctx.merchantId, actor: { type: "USER", userId: u.id, role: u.role } };
}

export async function counterPurchase(tx: Tx, ctx: Ctx, sessionId: string, token: string, amountCents: number, idempotencyKey?: string | null) {
  const sctx = await staffCtx(tx, ctx, sessionId, token);
  const s = await loadSession(tx, ctx, sessionId);
  if (s.status !== "IDENTIFIED") throw badRequest("SESSION_NOT_IDENTIFIED", "Le client doit d'abord être identifié");
  return recordPurchase(tx, sctx, { customerId: s.customerId!, amountCents, kioskSessionId: sessionId, idempotencyKey });
}

export async function counterRedeem(tx: Tx, ctx: Ctx, sessionId: string, token: string, rewardId: string) {
  const sctx = await staffCtx(tx, ctx, sessionId, token);
  const s = await loadSession(tx, ctx, sessionId);
  return redeemReward(tx, sctx, { customerId: s.customerId!, rewardId });
}

export async function counterApplyOffer(tx: Tx, ctx: Ctx, sessionId: string, token: string, offerId: string) {
  const sctx = await staffCtx(tx, ctx, sessionId, token);
  const s = await loadSession(tx, ctx, sessionId);
  const offer = await tx.campaignRecipient.findUnique({ where: { id: offerId } });
  if (!offer || offer.customerId !== s.customerId) throw notFound("Offre");
  return redeemOffer(tx, sctx, offerId);
}

export async function counterValidateIdentity(tx: Tx, ctx: Ctx, sessionId: string, token: string) {
  const sctx = await staffCtx(tx, ctx, sessionId, token);
  await staffValidateSession(tx, sctx, sessionId);
}
