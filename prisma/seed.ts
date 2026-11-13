/**
 * Données de démonstration (développement uniquement).
 * Crée : textes juridiques modèles, un admin Revio (avec 2FA), une boulangerie de démo,
 * deux comptes (propriétaire, vendeur), un catalogue, une roue et un code d'appairage tablette.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { systemDb, disconnectAll } from "../src/server/db";
import { LEGAL_TEMPLATES, LEGAL_TEMPLATES_VERSION } from "../src/server/legal-templates";
import { createMerchant } from "../src/server/services/merchants";
import { createUser } from "../src/server/services/auth";
import { createPairingCode } from "../src/server/services/devices";
import { generateTotpSecret, totpUri } from "../src/server/totp";
import { PRODUCT_NAME } from "../src/config/product";

const SYSTEM = { type: "SYSTEM" } as const;

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Seed interdit en production");
  const db = systemDb();

  for (const [type, content] of Object.entries(LEGAL_TEMPLATES)) {
    const exists = await db.legalDocument.findFirst({ where: { merchantId: null, type: type as never, version: LEGAL_TEMPLATES_VERSION } });
    if (!exists) {
      await db.legalDocument.create({
        data: { merchantId: null, type: type as never, version: LEGAL_TEMPLATES_VERSION, content, contentHash: createHash("sha256").update(content).digest("hex") },
      });
    }
  }

  if (!(await db.user.findUnique({ where: { email: "admin@revio.local" } }))) {
    const secret = generateTotpSecret();
    await createUser({ email: "admin@revio.local", password: "admin-revio-dev-2026", displayName: "Admin", role: "REVIO_ADMIN", merchantId: null, totpSecret: secret });
    console.log(`\nAdmin ${PRODUCT_NAME} : admin@revio.local / admin-revio-dev-2026`);
    console.log(`  Secret 2FA (à ajouter dans une app d'authentification) : ${secret}`);
    console.log(`  ${totpUri(PRODUCT_NAME, "admin@revio.local", secret)}`);
  }

  let merchant = await db.merchant.findUnique({ where: { slug: "boulangerie-demo" } });
  if (!merchant) {
    merchant = await createMerchant(SYSTEM, {
      name: "Boulangerie Démo",
      slug: "boulangerie-demo",
      vatNumber: "BE0123456789",
      addressLine1: "Rue du Marché 12",
      postalCode: "1000",
      city: "Bruxelles",
      plan: "PRO",
      owner: { email: "proprio@demo.local", displayName: "Claire (propriétaire)", password: "demo-proprio-2026" },
    });
    await createUser({ email: "vendeur@demo.local", password: "demo-vendeur-2026", displayName: "Sam (vendeur)", role: "STAFF", merchantId: merchant.id });
    await db.merchant.update({ where: { id: merchant.id }, data: { primaryColor: "#b45309", subscriptionStatus: "ACTIVE" } });
    await db.rules.update({ where: { merchantId: merchant.id }, data: { wheelEnabled: true } });
    const rewards = await Promise.all(
      [
        { name: "Croissant offert", pointsCost: 60 },
        { name: "Café offert", pointsCost: 100 },
        { name: "5 € de réduction", pointsCost: 250 },
      ].map((r, i) => db.reward.create({ data: { ...r, sortOrder: i, merchantId: merchant!.id } })),
    );
    await db.wheelPrize.createMany({
      data: [
        { label: "Perdu", type: "NOTHING", weight: 50 },
        { label: "+5 points", type: "POINTS", points: 5, weight: 30 },
        { label: "+20 points", type: "POINTS", points: 20, weight: 15 },
        { label: "Croissant", type: "REWARD", rewardId: rewards[0].id, weight: 5 },
      ].map((p, i) => ({ ...p, sortOrder: i, merchantId: merchant!.id })),
    });
    console.log(`\nCommerce de démo : ${merchant.name}`);
    console.log("  Propriétaire : proprio@demo.local / demo-proprio-2026");
    console.log("  Vendeur      : vendeur@demo.local / demo-vendeur-2026");
  }

  const pairing = await createPairingCode(db, SYSTEM, merchant.id, "Tablette comptoir");
  console.log(`\nCode d'appairage tablette (valable 30 min) : ${pairing.code}`);
  console.log("  → ouvrir /kiosque sur la tablette et saisir ce code\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(disconnectAll);
