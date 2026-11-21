import { z } from "zod";
import type { Tx } from "../db";
import { systemDb } from "../db";
import type { Ctx } from "../context";
import { AppError, badRequest, conflict, forbidden, notFound } from "../errors";
import { audit } from "../audit";
import { hashSecret, verifySecret } from "../crypto";
import { validatePassword } from "./auth";

const WEAK = new Set(["0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "1234", "4321", "0123", "123456", "000000", "111111"]);

export function validateStaffPin(pin: string) {
  if (!/^\d{4,6}$/.test(pin)) throw badRequest("INVALID_STAFF_PIN", "Le code vendeur doit comporter 4 à 6 chiffres");
  if (WEAK.has(pin)) throw badRequest("WEAK_STAFF_PIN", "Ce code est trop simple, choisissez-en un autre");
}

/** Deux membres ne peuvent pas avoir le même code : la tablette ne saurait pas qui encaisse. */
async function assertPinUnique(tx: Tx, merchantId: string, pin: string, exceptUserId?: string) {
  const others = await tx.user.findMany({ where: { merchantId, staffPinHash: { not: null }, disabledAt: null, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) } });
  for (const u of others) if (await verifySecret(u.staffPinHash!, pin)) throw conflict("STAFF_PIN_TAKEN", "Ce code est déjà utilisé par un autre membre de l'équipe");
}

async function assertEmailFree(email: string, exceptUserId?: string) {
  // Lecture globale (unicité des e-mails sur toute la plateforme), aucune donnée renvoyée
  const u = await systemDb().user.findUnique({ where: { email }, select: { id: true } });
  if (u && u.id !== exceptUserId) throw conflict("EMAIL_TAKEN", "Cet e-mail est déjà utilisé");
}

export const listTeam = (tx: Tx, merchantId: string) =>
  tx.user
    .findMany({ where: { merchantId }, orderBy: [{ disabledAt: { sort: "asc", nulls: "first" } }, { role: "asc" }, { displayName: "asc" }] })
    .then((users) =>
      users.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        role: u.role,
        email: u.email,
        hasLogin: !!u.email,
        hasPin: !!u.staffPinHash,
        lastLoginAt: u.lastLoginAt,
        disabled: !!u.disabledAt,
      })),
    );

export const memberSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  role: z.enum(["STAFF", "OWNER"]),
  pin: z.string().optional(),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal("").transform(() => undefined)),
  password: z.string().max(200).optional(),
});

/** Ajoute un membre : code vendeur (tablette) et/ou e-mail + mot de passe (caisse, appli). */
export async function addMember(tx: Tx, ctx: Ctx, input: z.infer<typeof memberSchema>) {
  if (!input.pin && !input.email) throw badRequest("NEED_ACCESS", "Donnez au moins un code vendeur ou un e-mail");
  if (input.pin) {
    validateStaffPin(input.pin);
    await assertPinUnique(tx, ctx.merchantId, input.pin);
  }
  if (input.email) {
    if (!input.password) throw badRequest("PASSWORD_REQUIRED", "Choisissez un mot de passe pour cet e-mail");
    validatePassword(input.password);
    await assertEmailFree(input.email);
  }
  const u = await tx.user.create({
    data: {
      merchantId: ctx.merchantId,
      displayName: input.displayName,
      role: input.role,
      email: input.email ?? null,
      passwordHash: input.email ? await hashSecret(input.password!) : null,
      staffPinHash: input.pin ? await hashSecret(input.pin) : null,
    },
  });
  await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "user.create", entityType: "user", entityId: u.id, metadata: { role: input.role, login: !!input.email, pin: !!input.pin } });
  return { id: u.id };
}

export const updateMemberSchema = z
  .object({
    displayName: z.string().trim().min(1).max(40),
    role: z.enum(["STAFF", "OWNER"]),
    pin: z.string(),
    removePin: z.literal(true),
    disabled: z.boolean(),
  })
  .partial();

export async function updateMember(tx: Tx, ctx: Ctx, userId: string, input: z.infer<typeof updateMemberSchema>) {
  const u = await tx.user.findUnique({ where: { id: userId } });
  if (!u) throw notFound("Membre");
  const self = ctx.actor.type === "USER" && ctx.actor.userId === userId;
  if (self && (input.disabled || input.role === "STAFF")) throw forbidden("Vous ne pouvez pas vous désactiver ou retirer vos propres droits");
  if (input.role === "STAFF" || input.disabled) {
    const owners = await tx.user.count({ where: { merchantId: ctx.merchantId, role: "OWNER", disabledAt: null, id: { not: userId } } });
    if (u.role === "OWNER" && owners === 0) throw conflict("LAST_OWNER", "Il faut garder au moins un propriétaire actif");
  }
  if (input.pin) {
    validateStaffPin(input.pin);
    await assertPinUnique(tx, ctx.merchantId, input.pin, userId);
  }
  if (input.removePin && !u.email) throw badRequest("NEED_ACCESS", "Ce membre n'a pas d'e-mail : il garde son code vendeur");
  await tx.user.update({
    where: { id: userId },
    data: {
      displayName: input.displayName,
      role: input.role,
      staffPinHash: input.pin ? await hashSecret(input.pin) : input.removePin ? null : undefined,
      disabledAt: input.disabled === undefined ? undefined : input.disabled ? new Date() : null,
    },
  });
  if (input.disabled) {
    // Déconnexion immédiate (sessions gérées par le rôle système, action auditée ci-dessous)
    await systemDb().userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  await audit(tx, {
    merchantId: ctx.merchantId,
    actor: ctx.actor,
    action: "user.update",
    entityType: "user",
    entityId: userId,
    metadata: { fields: Object.keys(input).filter((k) => k !== "pin"), pinChanged: !!input.pin },
  });
}

/** Changer son propre mot de passe (mot de passe actuel exigé). */
export async function changeOwnPassword(ctx: Ctx, current: string, next: string) {
  if (ctx.actor.type !== "USER") throw forbidden();
  validatePassword(next);
  const db = systemDb();
  const u = await db.user.findUniqueOrThrow({ where: { id: ctx.actor.userId } });
  if (!u.passwordHash || !(await verifySecret(u.passwordHash, current))) throw new AppError(401, "INVALID_CREDENTIALS", "Mot de passe actuel incorrect");
  await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashSecret(next) } });
  await audit(db, { merchantId: u.merchantId, actor: ctx.actor, action: "user.password_change", entityType: "user", entityId: u.id });
}
