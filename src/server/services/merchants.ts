import { z } from "zod";
import { systemDb } from "../db";
import type { Actor } from "../context";
import { audit } from "../audit";
import { conflict, notFound } from "../errors";
import { addMonths } from "../time";
import { initMerchantDefaults } from "./rules";
import { createUser } from "./auth";
import { applyTemplate } from "./templates";

export const createMerchantSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,40}$/, "Identifiant : lettres minuscules, chiffres et tirets"),
  vatNumber: z.string().trim().max(20).nullish(),
  addressLine1: z.string().trim().max(120).nullish(),
  postalCode: z.string().trim().max(10).nullish(),
  city: z.string().trim().max(60).nullish(),
  plan: z.enum(["ESSENTIEL", "PRO"]).default("ESSENTIEL"),
  businessType: z.string().max(40).nullish(),
  owner: z.object({
    email: z.string().email(),
    displayName: z.string().trim().min(1).max(60),
    password: z.string().min(12),
  }),
});

/** Admin Revio : crée un commerce, ses règles par défaut, et le compte du propriétaire. */
export async function createMerchant(actor: Actor, input: z.infer<typeof createMerchantSchema>) {
  const db = systemDb();
  if (await db.merchant.findUnique({ where: { slug: input.slug } })) throw conflict("SLUG_TAKEN", "Cet identifiant est déjà pris");
  if (await db.user.findUnique({ where: { email: input.owner.email.toLowerCase() } })) throw conflict("EMAIL_TAKEN", "Cet e-mail est déjà utilisé");
  const { owner, businessType, ...m } = input;
  const merchant = await db.$transaction(async (tx) => {
    const created = await tx.merchant.create({ data: { ...m, trialEndsAt: addMonths(new Date(), 1) } });
    await initMerchantDefaults(tx, created.id);
    if (businessType) await applyTemplate(tx, { merchantId: created.id, actor }, businessType);
    await audit(tx, { merchantId: created.id, actor, action: "merchant.create", entityType: "merchant", entityId: created.id });
    return created;
  });
  await createUser({ ...owner, role: "OWNER", merchantId: merchant.id });
  return merchant;
}

export async function createStaffUser(actor: Actor, merchantId: string, input: { email: string; displayName: string; password: string; role: "OWNER" | "STAFF" }) {
  const db = systemDb();
  if (await db.user.findUnique({ where: { email: input.email.toLowerCase() } })) throw conflict("EMAIL_TAKEN", "Cet e-mail est déjà utilisé");
  const u = await createUser({ ...input, merchantId });
  await audit(db, { merchantId, actor, action: "user.create", entityType: "user", entityId: u.id, metadata: { role: input.role } });
  return { id: u.id, email: u.email, role: u.role };
}

export async function setMerchantSuspended(actor: Actor, merchantId: string, suspended: boolean, reason?: string) {
  const db = systemDb();
  const m = await db.merchant.findUnique({ where: { id: merchantId } });
  if (!m) throw notFound("Commerce");
  await db.merchant.update({ where: { id: merchantId }, data: { suspendedAt: suspended ? new Date() : null } });
  if (suspended) {
    // Déconnecte immédiatement les vendeurs
    await db.userSession.updateMany({ where: { user: { merchantId }, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  await audit(db, { merchantId, actor, action: suspended ? "merchant.suspend" : "merchant.unsuspend", entityType: "merchant", entityId: merchantId, reason });
}

export async function listMerchants() {
  const db = systemDb();
  const merchants = await db.merchant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { customers: { where: { anonymizedAt: null } }, devices: { where: { revokedAt: null } }, users: true } },
    },
  });
  return merchants;
}

export async function getMerchantDetail(merchantId: string) {
  const db = systemDb();
  const m = await db.merchant.findUnique({
    where: { id: merchantId },
    include: {
      users: { select: { id: true, email: true, displayName: true, role: true, lastLoginAt: true, disabledAt: true } },
      devices: { orderBy: { createdAt: "desc" }, select: { id: true, name: true, pairedAt: true, lastSeenAt: true, revokedAt: true, pairingCodeExpiresAt: true } },
      _count: { select: { customers: { where: { anonymizedAt: null } } } },
    },
  });
  if (!m) throw notFound("Commerce");
  return m;
}

export async function listAuditLog(merchantId?: string | null, limit = 100) {
  return systemDb().auditLog.findMany({
    where: merchantId ? { merchantId } : {},
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 500),
    include: { actorUser: { select: { email: true } }, actorDevice: { select: { name: true } }, merchant: { select: { name: true } } },
  });
}
