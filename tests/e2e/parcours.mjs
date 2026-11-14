/**
 * Test de bout en bout dans un vrai navigateur (Playwright) :
 * admin (2FA) → appairage tablette → inscription client → code SMS → PIN
 * → caisse : achat → tablette : points + roue → caisse : récompense.
 *
 * Prérequis : serveur de dev lancé (npm run dev) sur une base fraîchement « seedée ».
 * Usage : E2E_ADMIN_TOTP=<secret> E2E_SERVER_LOG=<fichier de log du serveur> node tests/e2e/parcours.mjs
 */
import { createRequire } from "node:module";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.E2E_SCREENSHOTS; // dossier optionnel
const TOTP = process.env.E2E_ADMIN_TOTP;
const LOG = process.env.E2E_SERVER_LOG;
if (!TOTP || !LOG) throw new Error("E2E_ADMIN_TOTP et E2E_SERVER_LOG requis");

function totp(secret) {
  const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0; const bytes = [];
  for (const c of secret) { value = (value << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", Buffer.from(bytes)).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}
const lastSmsCode = () => {
  const m = [...readFileSync(LOG, "utf8").matchAll(/code de vérification est (\d{6})/g)];
  if (!m.length) throw new Error("Aucun SMS dans le log");
  return m.at(-1)[1];
};
const step = (s) => console.log(`✓ ${s}`);
const shot = async (page, name) => {
  if (!SHOTS) return;
  await page.waitForTimeout(1500); // fin des animations
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const tapDigits = async (page, digits) => { for (const d of digits) await page.getByRole("button", { name: d, exact: true }).click(); };

const browser = await chromium.launch();
try {
  // --- Admin : connexion 2FA, création d'un code d'appairage ---
  const admin = await (await browser.newContext()).newPage();
  await admin.goto(`${BASE}/connexion`);
  await admin.getByLabel("E-mail").fill("admin@revio.local");
  await admin.getByLabel("Mot de passe").fill("admin-revio-dev-2026");
  await admin.getByRole("button", { name: "Se connecter" }).click();
  await admin.getByLabel("Code de double authentification").fill(totp(TOTP));
  await admin.getByRole("button", { name: "Se connecter" }).click();
  await admin.waitForURL("**/admin");
  step("admin connecté avec 2FA");
  await admin.getByRole("button", { name: /Boulangerie Démo/ }).click();
  admin.once("dialog", (d) => d.accept("Tablette e2e"));
  await admin.getByRole("button", { name: "Appairer une tablette" }).click();
  const code = (await admin.locator(".font-mono.text-4xl").textContent()).trim();
  await shot(admin, "01-admin");
  step(`code d'appairage généré : ${code}`);

  // --- Tablette : appairage ---
  const kioskCtx = await browser.newContext({ viewport: { width: 1024, height: 1366 }, hasTouch: true });
  const kiosk = await kioskCtx.newPage();
  await kiosk.goto(`${BASE}/kiosque`);
  await kiosk.getByPlaceholder("XXXX-XXXX").fill(code);
  await kiosk.getByRole("button", { name: "Appairer" }).click();
  await kiosk.getByText("Tapez votre numéro de GSM").waitFor();
  await shot(kiosk, "02-kiosque-accueil");
  // La vitrine apparaît après 30 s d'inactivité ; un toucher ramène à l'accueil
  await kiosk.waitForTimeout(32_000);
  await kiosk.getByText("Touchez l'écran pour cumuler vos points").waitFor();
  await shot(kiosk, "02b-kiosque-vitrine");
  await kiosk.mouse.click(500, 600);
  await kiosk.getByText("Tapez votre numéro de GSM").waitFor();
  step("vitrine après 30 s d'inactivité, retour à l'accueil au toucher");
  step("tablette appairée");

  // --- Nouveau client ---
  await tapDigits(kiosk, "0470123456");
  await kiosk.getByRole("button", { name: "OK" }).click();
  await kiosk.getByText("Inscription en 30 secondes").waitFor();
  await kiosk.getByRole("textbox").fill("Léa");
  const submit = kiosk.getByRole("button", { name: "Recevoir mon code par SMS" });
  if (await submit.isEnabled()) throw new Error("Le bouton devrait être désactivé sans CGU");
  await kiosk.getByText("J'ai 16 ans ou plus").click();
  await kiosk.locator("label", { hasText: "conditions du programme" }).locator("input").check();
  await shot(kiosk, "03-kiosque-inscription");
  await submit.click();
  await kiosk.getByText("Code reçu par SMS").waitFor();
  step("inscription envoyée, SMS reçu");
  await tapDigits(kiosk, lastSmsCode());
  await kiosk.getByText("Choisissez un code à 4 chiffres").waitFor();
  await tapDigits(kiosk, "4821");
  await kiosk.getByText("Confirmez votre code").waitFor();
  await tapDigits(kiosk, "4821");
  await kiosk.getByText("Bonjour Léa !").waitFor();
  await shot(kiosk, "04-kiosque-identifie");
  step("numéro vérifié, PIN choisi, client identifié");

  // --- Caisse ---
  const pos = await (await browser.newContext({ viewport: { width: 1366, height: 1024 } })).newPage();
  await pos.goto(`${BASE}/caisse`);
  await pos.waitForURL("**/connexion**");
  await pos.getByLabel("E-mail").fill("vendeur@demo.local");
  await pos.getByLabel("Mot de passe").fill("demo-vendeur-2026");
  await pos.getByRole("button", { name: "Se connecter" }).click();
  await pos.waitForURL("**/caisse");
  await pos.getByRole("button", { name: /Léa/ }).click();
  await pos.getByText("Le résultat s'affichera sur la tablette").waitFor();
  await tapDigits(pos, "12450"); // 124,50 €
  await shot(pos, "05-caisse");
  await pos.getByRole("button", { name: "Valider" }).click();
  const toast = await pos.getByText(/\+\d+ points pour Léa/).textContent();
  const earned = Number(toast.match(/\+(\d+)/)[1]);
  if (earned !== 124 && earned !== 248) throw new Error(`Points inattendus : ${toast}`);
  step(`caisse : achat de 124,50 € → +${earned} points${earned === 248 ? " (heures creuses ×2)" : ""}`);

  // --- Tablette : résultat + roue ---
  await kiosk.getByText("points gagnés !").waitFor({ timeout: 10000 });
  await kiosk.getByText(`Nouveau solde : ${earned} points`).waitFor();
  await shot(kiosk, "06-kiosque-points");
  await kiosk.getByRole("button", { name: /Tourner la roue/ }).click();
  await kiosk.waitForTimeout(4600);
  await shot(kiosk, "07-kiosque-roue");
  step("tablette : points affichés, roue tournée");
  await kiosk.getByRole("button", { name: "Terminer" }).click();
  await kiosk.getByText("Tapez votre numéro de GSM").waitFor();
  step("retour à l'accueil, plus aucune donnée affichée");

  // --- Client connu : PIN ---
  await tapDigits(kiosk, "0470123456");
  await kiosk.getByRole("button", { name: "OK" }).click();
  await kiosk.getByText("Votre code secret").waitFor();
  await tapDigits(kiosk, "4821");
  await kiosk.getByText("Bonjour Léa !").waitFor();
  step("client connu identifié par PIN");

  // --- Caisse : récompense ---
  await pos.reload();
  await pos.getByRole("button", { name: /Léa/ }).click();
  pos.once("dialog", (d) => d.accept());
  await pos.locator("div.justify-between", { has: pos.getByText("Café offert", { exact: true }) }).getByRole("button", { name: "Remettre" }).click();
  await pos.getByText(/Café offert remis/).waitFor();
  step("caisse : récompense « Café offert » remise");

  // --- Tablette : reset automatique ---
  await kiosk.getByRole("button", { name: "Terminer" }).click();
  await kiosk.getByText("Tapez votre numéro de GSM").waitFor();

  // --- Isolation côté navigateur : le vendeur n'accède pas à l'admin ---
  const r = await pos.request.get(`${BASE}/api/v1/admin/merchants`);
  if (r.status() !== 403) throw new Error(`admin accessible au vendeur : ${r.status()}`);
  step("le vendeur n'a pas accès à l'admin (403)");

  console.log("\nParcours complet OK");
} finally {
  await browser.close();
}
