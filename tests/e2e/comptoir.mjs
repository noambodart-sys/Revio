/**
 * Mode comptoir et préférences sur la tablette. À lancer APRÈS parcours.mjs et gestion.mjs
 * (cliente « Léa » PIN 4821, vendeuse « Inès » code 2580, style « Chaleureux »).
 * Usage : E2E_PAIRING_CODE=<code> node tests/e2e/comptoir.mjs   (E2E_SCREENSHOTS optionnel)
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const CODE = process.env.E2E_PAIRING_CODE;
const SHOTS = process.env.E2E_SCREENSHOTS;
if (!CODE) throw new Error("E2E_PAIRING_CODE requis");
const step = (s) => console.log(`✓ ${s}`);
const shot = async (page, name) => {
  if (!SHOTS) return;
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const tap = async (page, digits) => { for (const d of digits) await page.getByRole("button", { name: d, exact: true }).click(); };

const browser = await chromium.launch();
try {
  const kiosk = await (await browser.newContext({ viewport: { width: 1366, height: 1024 }, hasTouch: true })).newPage();
  await kiosk.goto(`${BASE}/kiosque`);
  await kiosk.getByPlaceholder("XXXX-XXXX").fill(CODE);
  await kiosk.getByRole("button", { name: "Appairer" }).click();
  await kiosk.getByText("Votre fidélité a bon goût").waitFor();
  if ((await kiosk.locator("main.kiosk").getAttribute("data-theme")) !== "chaleureux") throw new Error("style non appliqué");
  await shot(kiosk, "c1-accueil-chaleureux");
  step("tablette : style « Chaleureux » et titre personnalisé appliqués");

  await tap(kiosk, "0470123456");
  await kiosk.getByRole("button", { name: "OK" }).click();
  await tap(kiosk, "4821");
  await kiosk.getByText("Bonjour Léa !").waitFor();
  await kiosk.getByRole("button", { name: "Espace vendeur" }).click();
  await kiosk.getByText("Code vendeur", { exact: true }).waitFor();
  await tap(kiosk, "9999");
  await kiosk.getByRole("button", { name: "OK" }).click();
  await kiosk.getByText("Code vendeur incorrect").waitFor();
  await tap(kiosk, "2580");
  await kiosk.getByRole("button", { name: "OK" }).click();
  await kiosk.getByText("Vendeur : Inès").waitFor();
  await tap(kiosk, "1000");
  await shot(kiosk, "c2-espace-vendeur");
  await kiosk.getByRole("button", { name: "Valider" }).click();
  await kiosk.getByText("points gagnés !").waitFor();
  await shot(kiosk, "c3-points");
  step("mode comptoir : code faux refusé, achat de 10 € encaissé sur la tablette par Inès");
  await kiosk.getByRole("button", { name: "Terminer" }).click();

  await tap(kiosk, "0470123456");
  await kiosk.getByRole("button", { name: "OK" }).click();
  await tap(kiosk, "4821");
  await kiosk.getByRole("button", { name: "Mes préférences" }).click();
  const box = kiosk.getByRole("checkbox");
  const before = await box.isChecked();
  await box.click();
  await kiosk.waitForTimeout(800);
  if ((await box.isChecked()) === before) throw new Error("préférence non enregistrée");
  await shot(kiosk, "c4-preferences");
  await box.click();
  step("préférences : la cliente change elle-même son accord pour les offres SMS");

  console.log("\nComptoir OK");
} finally {
  await browser.close();
}
