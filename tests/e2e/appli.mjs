/**
 * Appli du commerçant (/app) sur un écran de téléphone. À lancer APRÈS tests/e2e/parcours.mjs
 * (cliente « Léa », qui accepte les offres par SMS), sur le même serveur.
 * Usage : E2E_SERVER_LOG=<log du serveur> node tests/e2e/appli.mjs   (E2E_SCREENSHOTS optionnel)
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.E2E_SCREENSHOTS;
const LOG = process.env.E2E_SERVER_LOG;
const step = (s) => console.log(`✓ ${s}`);
const shot = async (page, name) => {
  if (!SHOTS) return;
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const browser = await chromium.launch();
try {
  const phone = await (await browser.newContext({ ...devices["iPhone 13"] })).newPage();
  phone.on("dialog", (d) => d.accept());

  await phone.goto(`${BASE}/connexion`);
  await phone.getByLabel("E-mail").fill("proprio@demo.local");
  await phone.getByLabel("Mot de passe").fill("demo-proprio-2026");
  await phone.getByRole("button", { name: "Se connecter" }).click();
  await phone.waitForURL("**/app");
  await phone.getByText("Passages aujourd'hui").waitFor();
  await phone.getByText("Nos idées pour vous").waitFor();
  await shot(phone, "a1-aujourdhui");
  step("connexion sur téléphone → appli, écran Aujourd'hui avec suggestions");

  await phone.getByRole("button", { name: "Clients", exact: true }).click();
  await phone.getByText("Mes habitués").waitFor();
  await shot(phone, "a2-clients");
  await phone.getByRole("button", { name: /Tous mes clients/ }).click();
  await phone.getByRole("button", { name: /Léa/ }).click();
  await phone.getByText("Offres par SMS").waitFor();
  await phone.getByText("Accepte").waitFor();
  await shot(phone, "a3-fiche");
  step("clients : groupes, liste, fiche (numéro masqué, accord SMS)");

  await phone.getByRole("button", { name: "Retour" }).click();
  await phone.getByRole("button", { name: "Envoyer une offre à ce groupe" }).click();
  await phone.getByText("Que voulez-vous dire ?").waitFor();
  await shot(phone, "a4-quoi");
  await phone.getByRole("button", { name: /Une promo/ }).click();
  await phone.getByLabel("La réduction").fill("-20 %");
  await phone.getByLabel("Sur quoi ?").fill("les croissants");
  await phone.getByLabel("Quand ?").fill("ce week-end");
  await shot(phone, "a5-completer");
  await phone.getByRole("button", { name: "Continuer" }).click();
  await phone.getByText("Vérifiez et envoyez").waitFor();
  await phone.getByText(/Bonjour Léa ! -20 % sur les croissants ce week-end/).waitFor();
  await shot(phone, "a6-apercu");
  step("assistant : modèle « promo », champs, aperçu personnalisé");

  const closed = await phone.getByText(/Les SMS partent entre|Pas d'envoi le dimanche/).isVisible();
  if (closed) {
    step("hors de la plage d'envoi : bouton désactivé et explication affichée (envoi non testé)");
  } else {
    await phone.getByRole("button", { name: /Envoyer à 1 client/ }).click();
    await phone.getByText("1 SMS envoyé").waitFor();
    if (LOG && !/\[SMS → \+32 4•• •• •• 56\] Bonjour Léa ! -20 %/.test(readFileSync(LOG, "utf8"))) throw new Error("SMS non trouvé dans le log");
    await shot(phone, "a7-envoye");
    await phone.getByRole("button", { name: "Voir les résultats" }).click();
    await phone.getByText("Grâce à vos messages").waitFor();
    await shot(phone, "a8-resultats");
    step("envoi : 1 SMS (masqué dans le log), résultats affichés");

    // Caisse : l'offre s'affiche et s'applique
    const pos = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    pos.on("dialog", (d) => d.accept());
    await pos.goto(`${BASE}/connexion`);
    await pos.getByLabel("E-mail").fill("vendeur@demo.local");
    await pos.getByLabel("Mot de passe").fill("demo-vendeur-2026");
    await pos.getByRole("button", { name: "Se connecter" }).click();
    await pos.waitForURL("**/caisse");
    await pos.getByPlaceholder("0470 12 34 56").fill("0470123456");
    await pos.getByRole("button", { name: "OK" }).click();
    await pos.getByText("Offre reçue par SMS : -20 % sur les croissants").waitFor();
    await pos.getByRole("button", { name: "Appliquer" }).click();
    await pos.getByText("Offre « -20 % sur les croissants » appliquée").waitFor();
    step("caisse : offre reçue par SMS affichée puis appliquée");
  }
  console.log("\nAppli commerçant OK");
} finally {
  await browser.close();
}
