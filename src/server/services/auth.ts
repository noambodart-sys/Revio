import type { UserRole } from "@prisma/client";
import { systemDb } from "../db";
import { AppError } from "../errors";
import { audit } from "../audit";
import { decrypt, encrypt, getDummyHash, hashSecret, randomToken, sha256, verifySecret } from "../crypto";
import { verifyTotp } from "../totp";
import { addMinutes } from "../time";
import { TECH } from "@/config/product";

export const SESSION_COOKIE = "revio_session";

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  merchantId: string | null;
  merchantName: string | null;
}

const INVALID = () => new AppError(401, "INVALID_CREDENTIALS", "E-mail, mot de passe ou code incorrect");

export function validatePassword(pw: string) {
  if (pw.length < 12) throw new AppError(400, "WEAK_PASSWORD", "Le mot de passe doit comporter au moins 12 caractères");
}

export async function login(emailRaw: string, password: string, totp?: string | null) {
  const db = systemDb();
  const email = emailRaw.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email }, include: { merchant: true } });
  if (!user || user.disabledAt) {
    await verifySecret(await getDummyHash(), password); // temps de réponse constant
    throw INVALID();
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(423, "ACCOUNT_LOCKED", "Compte temporairement bloqué après plusieurs essais. Réessayez plus tard.");
  }
  const okPassword = await verifySecret(user.passwordHash, password);
  const needsTotp = user.role === "REVIO_ADMIN" || !!user.totpSecretEnc;
  const okTotp = !needsTotp || (!!user.totpSecretEnc && !!totp && verifyTotp(decrypt(user.totpSecretEnc), totp));

  if (!okPassword || !okTotp) {
    const attempts = user.failedLoginCount + 1;
    const lock = attempts >= TECH.userMaxFailedLogins;
    await db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: lock ? 0 : attempts, lockedUntil: lock ? addMinutes(new Date(), TECH.userLockMinutes) : null },
    });
    if (lock) await audit(db, { merchantId: user.merchantId, actor: { type: "USER", userId: user.id, role: user.role }, action: "auth.locked", entityType: "user", entityId: user.id });
    if (okPassword && needsTotp && !totp) throw new AppError(401, "TOTP_REQUIRED", "Code de double authentification requis");
    throw INVALID();
  }
  if (user.merchant?.suspendedAt) throw new AppError(403, "MERCHANT_SUSPENDED", "Ce commerce est suspendu. Contactez le support.");

  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + TECH.userSessionHours * 3600_000);
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } }),
    db.userSession.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt } }),
  ]);
  return { token, expiresAt, user: { id: user.id, role: user.role } };
}

export async function getSessionUser(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  const s = await systemDb().userSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { merchant: true } } },
  });
  if (!s || s.revokedAt || s.expiresAt < new Date() || s.user.disabledAt) return null;
  if (s.user.merchant?.suspendedAt) return null;
  return {
    id: s.user.id,
    email: s.user.email,
    displayName: s.user.displayName,
    role: s.user.role,
    merchantId: s.user.merchantId,
    merchantName: s.user.merchant?.name ?? null,
  };
}

export async function logout(token: string | undefined | null) {
  if (!token) return;
  await systemDb().userSession.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
}

/** Création d'un compte (admin Revio, ou script). */
export async function createUser(input: {
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
  merchantId: string | null;
  totpSecret?: string | null;
}) {
  validatePassword(input.password);
  if (input.role === "REVIO_ADMIN" && !input.totpSecret) throw new AppError(400, "TOTP_REQUIRED", "La 2FA est obligatoire pour les admins");
  return systemDb().user.create({
    data: {
      email: input.email.trim().toLowerCase(),
      passwordHash: await hashSecret(input.password),
      displayName: input.displayName,
      role: input.role,
      merchantId: input.role === "REVIO_ADMIN" ? null : input.merchantId,
      totpSecretEnc: input.totpSecret ? encrypt(input.totpSecret) : null,
    },
  });
}
