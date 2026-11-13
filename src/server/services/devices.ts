import type { PrismaClient } from "@prisma/client";
import { AppError, notFound } from "../errors";
import { audit } from "../audit";
import type { Actor } from "../context";
import { randomPairingCode, randomToken, sha256 } from "../crypto";
import { addMinutes } from "../time";
import { TECH } from "@/config/product";

const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Admin Revio : génère un code d'appairage à usage unique pour une nouvelle tablette. */
export async function createPairingCode(db: PrismaClient, actor: Actor, merchantId: string, name: string) {
  const code = randomPairingCode(8);
  const device = await db.device.create({
    data: { merchantId, name, pairingCodeHash: sha256(code), pairingCodeExpiresAt: addMinutes(new Date(), TECH.pairingCodeTtlMinutes) },
  });
  await audit(db, { merchantId, actor, action: "device.create", entityType: "device", entityId: device.id, metadata: { name } });
  return { deviceId: device.id, code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt: device.pairingCodeExpiresAt };
}

/** La tablette échange le code contre un jeton propre à l'appareil (montré une seule fois). */
export async function pairDevice(db: PrismaClient, rawCode: string) {
  const code = normalizeCode(rawCode);
  if (code.length !== 8) throw new AppError(400, "INVALID_CODE", "Code d'appairage invalide");
  const device = await db.device.findFirst({ where: { pairingCodeHash: sha256(code) }, include: { merchant: true } });
  if (!device || device.revokedAt || !device.pairingCodeExpiresAt || device.pairingCodeExpiresAt < new Date()) {
    throw new AppError(400, "INVALID_CODE", "Code d'appairage invalide ou expiré");
  }
  const token = randomToken(32);
  await db.device.update({
    where: { id: device.id },
    data: { tokenHash: sha256(token), pairedAt: new Date(), lastSeenAt: new Date(), pairingCodeHash: null, pairingCodeExpiresAt: null },
  });
  await audit(db, { merchantId: device.merchantId, actor: { type: "DEVICE", deviceId: device.id }, action: "device.pair", entityType: "device", entityId: device.id });
  return { token, deviceId: device.id, merchantName: device.merchant.name };
}

/** Authentifie une requête tablette. Refuse les appareils révoqués et les commerces suspendus. */
export async function authenticateDevice(db: PrismaClient, token: string) {
  if (!token || token.length < 20) return null;
  const device = await db.device.findUnique({ where: { tokenHash: sha256(token) }, include: { merchant: true } });
  if (!device || device.revokedAt || device.merchant.suspendedAt) return null;
  if (!device.lastSeenAt || Date.now() - device.lastSeenAt.getTime() > 60_000) {
    await db.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
  }
  return { deviceId: device.id, merchantId: device.merchantId, merchant: device.merchant };
}

export async function revokeDevice(db: PrismaClient, actor: Actor, deviceId: string) {
  const d = await db.device.findUnique({ where: { id: deviceId } });
  if (!d) throw notFound("Tablette");
  await db.device.update({ where: { id: deviceId }, data: { revokedAt: new Date(), tokenHash: null, pairingCodeHash: null } });
  await db.kioskSession.updateMany({ where: { deviceId, status: { in: ["AWAITING_AUTH", "IDENTIFIED"] } }, data: { status: "CANCELED" } });
  await audit(db, { merchantId: d.merchantId, actor, action: "device.revoke", entityType: "device", entityId: deviceId });
}
