import type { Customer, Rules } from "@prisma/client";
import type { Tx } from "../db";
import type { Ctx } from "../context";
import { AppError, badRequest, conflict, notFound } from "../errors";
import { decrypt, encrypt, hashSecret, lookupHash, randomDigits, safeEqual, verifySecret } from "../crypto";
import { maskPhone, normalizePhone } from "../phone";
import { sms } from "../sms";
import { addMinutes, addSeconds } from "../time";
import { PRODUCT_NAME, TECH } from "@/config/product";
import { getBalance } from "./points";
import { recordConsent } from "./consents";
import { getRules } from "./rules";
import { engagementSummary } from "./engagement";
import { activeOffers } from "./campaigns";

export const phoneLookup = (e164: string) => lookupHash("PHONE", e164);

export async function findCustomerByPhone(tx: Tx, merchantId: string, e164: string) {
  const ident = await tx.customerIdentifier.findUnique({
    where: { merchantId_type_lookupHash: { merchantId, type: "PHONE", lookupHash: phoneLookup(e164) } },
    include: { customer: true },
  });
  if (!ident || ident.revokedAt || ident.customer.anonymizedAt) return null;
  return ident.customer;
}

export async function getPhoneIdentifier(tx: Tx, customerId: string) {
  return tx.customerIdentifier.findFirst({ where: { customerId, type: "PHONE", revokedAt: null } });
}

/** Résumé affichable (tablette, caisse) : jamais le numéro complet. */
export async function customerSummary(tx: Tx, customerId: string) {
  const c = await tx.customer.findUnique({ where: { id: customerId }, include: { currentTier: true } });
  if (!c || c.anonymizedAt) throw notFound("Client");
  const rules = await getRules(tx, c.merchantId);
  const [balance, ident, rewards, tiers, engagement, offers] = await Promise.all([
    getBalance(tx, c.id),
    getPhoneIdentifier(tx, c.id),
    tx.reward.findMany({ where: { merchantId: c.merchantId, active: true }, orderBy: { pointsCost: "asc" } }),
    tx.tierLevel.findMany({ where: { merchantId: c.merchantId }, orderBy: { rank: "asc" } }),
    engagementSummary(tx, rules, c.id),
    activeOffers(tx, c.id),
  ]);
  const available = rewards.filter((r) => r.pointsCost <= balance && (r.stock === null || r.stock > 0));
  const next = rewards.find((r) => r.pointsCost > balance) ?? null;
  const nextTier = c.currentTier ? tiers.find((t) => t.rank === c.currentTier!.rank + 1) ?? null : tiers[0] ?? null;
  return {
    id: c.id,
    firstName: c.firstName,
    maskedPhone: ident?.displayHint ?? null,
    balance,
    tier: rules.tiersEnabled && c.currentTier ? { name: c.currentTier.name, bonusPercent: c.currentTier.bonusPercent } : null,
    engagement,
    offers,
    nextTier: rules.tiersEnabled && nextTier ? { name: nextTier.name, minPoints: nextTier.minPoints } : null,
    availableRewards: available.map((r) => ({ id: r.id, name: r.name, pointsCost: r.pointsCost })),
    nextReward: next ? { id: next.id, name: next.name, pointsCost: next.pointsCost, missing: next.pointsCost - balance } : null,
    enrolledAt: c.enrolledAt,
    lastVisitAt: c.lastVisitAt,
    phoneVerified: !!c.phoneVerifiedAt,
    pinLocked: !!(c.pinLockedUntil && c.pinLockedUntil > new Date()),
  };
}

// ---------------------------------------------------------------------------
// Inscription
// ---------------------------------------------------------------------------

export interface EnrollInput {
  phone: string;
  firstName?: string | null;
  acceptTerms: boolean;
  confirmAge16: boolean;
  marketingSms: boolean;
  marketingEmail: boolean;
}

/**
 * Crée le client (non vérifié), enregistre chaque consentement séparément, et envoie le code SMS.
 * Seul le numéro est obligatoire.
 */
export async function enrollCustomer(tx: Tx, ctx: Ctx, input: EnrollInput) {
  if (!input.acceptTerms) throw badRequest("TERMS_REQUIRED", "Merci d'accepter les conditions du programme");
  if (!input.confirmAge16) throw badRequest("AGE_REQUIRED", "Le programme est réservé aux personnes de 16 ans et plus");
  const e164 = normalizePhone(input.phone);
  const firstName = input.firstName?.trim().slice(0, 40) || null;

  let customer = await tx.customerIdentifier
    .findUnique({ where: { merchantId_type_lookupHash: { merchantId: ctx.merchantId, type: "PHONE", lookupHash: phoneLookup(e164) } }, include: { customer: true } })
    .then((i) => (i && !i.revokedAt && !i.customer.anonymizedAt ? i.customer : null));

  if (customer?.phoneVerifiedAt) throw conflict("ALREADY_ENROLLED", "Ce numéro est déjà inscrit");

  if (!customer) {
    customer = await tx.customer.create({ data: { merchantId: ctx.merchantId, firstName } });
    await tx.customerIdentifier.create({
      data: {
        merchantId: ctx.merchantId,
        customerId: customer.id,
        type: "PHONE",
        lookupHash: phoneLookup(e164),
        valueEnc: encrypt(e164),
        displayHint: maskPhone(e164),
      },
    });
  } else if (firstName !== customer.firstName) {
    customer = await tx.customer.update({ where: { id: customer.id }, data: { firstName } });
  }

  await recordConsent(tx, ctx, customer.id, "TERMS", true);
  await recordConsent(tx, ctx, customer.id, "AGE_16_PLUS", true);
  await recordConsent(tx, ctx, customer.id, "MARKETING_SMS", !!input.marketingSms);
  await recordConsent(tx, ctx, customer.id, "MARKETING_EMAIL", !!input.marketingEmail);

  await sendVerificationCode(tx, ctx.merchantId, e164);
  return customer;
}

/** Code SMS à 6 chiffres, haché, expirant, limité à N envois par heure. */
export async function sendVerificationCode(tx: Tx, merchantId: string, e164: string) {
  const hash = phoneLookup(e164);
  const recent = await tx.phoneVerification.count({
    where: { merchantId, lookupHash: hash, createdAt: { gte: addMinutes(new Date(), -60) } },
  });
  if (recent >= TECH.smsCodesPerHour) {
    throw new AppError(429, "TOO_MANY_CODES", "Trop de codes envoyés. Réessayez dans une heure ou demandez au vendeur.");
  }
  const code = randomDigits(6);
  await tx.phoneVerification.create({
    data: {
      merchantId,
      lookupHash: hash,
      codeHash: lookupHash("SMS_CODE", `${hash}:${code}`),
      expiresAt: addSeconds(new Date(), TECH.smsCodeTtlSeconds),
    },
  });
  const merchant = await tx.merchant.findUniqueOrThrow({ where: { id: merchantId }, select: { name: true } });
  await sms().send(e164, `${merchant.name} (${PRODUCT_NAME}) : votre code de vérification est ${code}. Il expire dans 10 minutes.`);
}

/**
 * Vérifie le code SMS. Ne lève pas d'exception en cas d'échec : le compteur d'essais
 * doit être enregistré (une exception annulerait la transaction).
 */
export async function checkVerificationCode(tx: Tx, merchantId: string, customerId: string, code: string) {
  const ident = await getPhoneIdentifier(tx, customerId);
  if (!ident) throw notFound("Client");
  const v = await tx.phoneVerification.findFirst({
    where: { merchantId, lookupHash: ident.lookupHash, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!v || v.expiresAt < new Date() || v.attempts >= TECH.smsCodeMaxAttempts) {
    return { ok: false as const, reason: "EXPIRED" as const };
  }
  const expected = lookupHash("SMS_CODE", `${ident.lookupHash}:${code}`);
  if (!/^\d{6}$/.test(code) || !safeEqual(expected, v.codeHash)) {
    await tx.phoneVerification.update({ where: { id: v.id }, data: { attempts: { increment: 1 } } });
    return { ok: false as const, reason: "INVALID" as const, remaining: TECH.smsCodeMaxAttempts - v.attempts - 1 };
  }
  await tx.phoneVerification.update({ where: { id: v.id }, data: { consumedAt: new Date() } });
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// PIN
// ---------------------------------------------------------------------------

const WEAK_PINS = new Set(["0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "1234", "4321", "0123", "9876"]);

export function validatePin(pin: string) {
  if (!/^\d{4}$/.test(pin)) throw badRequest("INVALID_PIN", "Le code doit comporter 4 chiffres");
  if (WEAK_PINS.has(pin)) throw badRequest("WEAK_PIN", "Ce code est trop simple, choisissez-en un autre");
}

export async function setPin(tx: Tx, customerId: string, pin: string) {
  validatePin(pin);
  await tx.customer.update({
    where: { id: customerId },
    data: { pinHash: await hashSecret(pin), pinFailedAttempts: 0, pinLockedUntil: null },
  });
}

export const isPinLocked = (c: Pick<Customer, "pinLockedUntil">) => !!(c.pinLockedUntil && c.pinLockedUntil > new Date());

/** Vérifie le PIN et gère le blocage. Retourne un résultat (pas d'exception, voir checkVerificationCode). */
export async function checkPin(tx: Tx, rules: Rules, customer: Customer, pin: string) {
  if (isPinLocked(customer)) return { ok: false as const, locked: true, remaining: 0 };
  if (!customer.pinHash) return { ok: false as const, locked: false, remaining: 0, noPin: true };
  if (/^\d{4}$/.test(pin) && (await verifySecret(customer.pinHash, pin))) {
    await tx.customer.update({ where: { id: customer.id }, data: { pinFailedAttempts: 0, pinLockedUntil: null } });
    return { ok: true as const };
  }
  const attempts = customer.pinFailedAttempts + 1;
  const locked = attempts >= rules.pinMaxAttempts;
  await tx.customer.update({
    where: { id: customer.id },
    data: { pinFailedAttempts: locked ? 0 : attempts, pinLockedUntil: locked ? addMinutes(new Date(), TECH.pinLockMinutes) : null },
  });
  return { ok: false as const, locked, remaining: locked ? 0 : rules.pinMaxAttempts - attempts };
}

/** Numéro en clair : uniquement pour l'export RGPD et l'envoi de SMS. */
export async function revealPhone(tx: Tx, customerId: string) {
  const ident = await getPhoneIdentifier(tx, customerId);
  return ident ? decrypt(ident.valueEnc) : null;
}
