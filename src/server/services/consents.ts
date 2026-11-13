import type { ConsentType, LegalDocumentType } from "@prisma/client";
import type { Tx } from "../db";
import type { Ctx } from "../context";
import { actorDeviceId, actorUserId } from "../context";
import { AppError } from "../errors";

/** Texte juridique de référence pour chaque type de consentement. */
const DOC_FOR_CONSENT: Record<ConsentType, LegalDocumentType> = {
  TERMS: "TERMS",
  AGE_16_PLUS: "TERMS",
  MARKETING_SMS: "MARKETING_SMS",
  MARKETING_EMAIL: "MARKETING_EMAIL",
};

/** Dernière version publiée : celle du commerçant si elle existe, sinon le modèle Revio. */
export async function currentLegalDocument(tx: Tx, merchantId: string, type: LegalDocumentType) {
  const own = await tx.legalDocument.findFirst({ where: { merchantId, type }, orderBy: { publishedAt: "desc" } });
  if (own) return own;
  const global = await tx.legalDocument.findFirst({ where: { merchantId: null, type }, orderBy: { publishedAt: "desc" } });
  if (!global) throw new AppError(500, "LEGAL_DOC_MISSING", `Texte juridique manquant : ${type}`);
  return global;
}

/** Ajoute un choix (jamais de mise à jour : l'historique est la preuve). */
export async function recordConsent(tx: Tx, ctx: Ctx, customerId: string, type: ConsentType, granted: boolean) {
  const doc = await currentLegalDocument(tx, ctx.merchantId, DOC_FOR_CONSENT[type]);
  return tx.consent.create({
    data: {
      merchantId: ctx.merchantId,
      customerId,
      type,
      granted,
      legalDocumentId: doc.id,
      textVersion: doc.version,
      deviceId: actorDeviceId(ctx.actor),
      userId: actorUserId(ctx.actor),
    },
  });
}

/** État courant : la ligne la plus récente par type. */
export async function currentConsents(tx: Tx, customerId: string): Promise<Record<ConsentType, boolean>> {
  const rows = await tx.consent.findMany({ where: { customerId }, orderBy: { createdAt: "asc" } });
  const state: Record<ConsentType, boolean> = { TERMS: false, AGE_16_PLUS: false, MARKETING_SMS: false, MARKETING_EMAIL: false };
  for (const r of rows) state[r.type] = r.granted;
  return state;
}

/** Remplace les variables d'un modèle par les informations du commerçant. */
export function renderLegalText(content: string, vars: Record<string, string>) {
  return content.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? `[${k}]`);
}
