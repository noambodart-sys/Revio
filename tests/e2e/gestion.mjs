/**
 * Back-office du commerçant, dans un vrai navigateur. À lancer APRÈS tests/e2e/parcours.mjs
 * (qui crée la cliente « Léa »), sur le même serveur.
 * Usage : node tests/e2e/gestion.mjs   (E2E_BASE_URL, E2E_SCREENSHOTS optionnels)
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.E2E_SCREENSHOTS;
const step = (s) => console.log(`✓ ${s}`);
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

const browser = await chromium.launch();
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(`${BASE}/gestion`);
  await page.waitForURL("**/connexion**");
  await page.getByLabel("E-mail").fill("proprio@demo.local");
  await page.getByLabel("Mot de passe").fill("demo-proprio-2026");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/gestion");

  // Tableau de bord
  await page.getByText("Clients inscrits").waitFor();
  await page.getByText("Passages par jour (30 derniers jours)").waitFor();
  const tile = await page.locator(".card", { hasText: "Clients inscrits" }).locator(".text-3xl").textContent();
  if (tile.trim() !== "1") throw new Error(`Clients inscrits attendu 1, reçu ${tile}`);
  await page.getByRole("button", { name: "Voir le tableau" }).click();
  await page.getByRole("cell", { name: "1", exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Voir le graphique" }).click();
  await shot(page, "g1-tableau-de-bord");
  await page.getByText("Ce que votre programme de fidélité vous apporte").waitFor();
  await page.getByText("Habitués à relancer").waitFor();
  step("tableau de bord : impact, chiffres, graphique, vue tableau, habitués à relancer");

  // Clients
  await page.getByRole("button", { name: "Clients", exact: true }).click();
  await page.getByRole("cell", { name: /Léa/ }).waitFor();
  await page.getByPlaceholder(/Prénom ou numéro/).fill("0470 12 34 56");
  await page.getByRole("button", { name: "Rechercher" }).click();
  await page.getByRole("cell", { name: /Léa/ }).waitFor();
  await shot(page, "g2-clients");
  const dl = page.waitForEvent("download");
  await page.getByRole("link", { name: /Exporter/ }).click();
  const csv = await (await dl).path().then((p) => require("node:fs").readFileSync(p, "utf8"));
  if (!csv.includes("Léa") || /470123456/.test(csv)) throw new Error("Export CSV incorrect");
  step("clients : liste, recherche par numéro, export CSV avec numéros masqués");

  // Récompenses
  await page.getByRole("button", { name: "Récompenses", exact: true }).click();
  await page.getByPlaceholder("ex. Café offert").fill("Baguette offerte");
  await page.getByPlaceholder("ex. 100").fill("40");
  await page.getByRole("button", { name: "Ajouter" }).click();
  await page.getByText("Baguette offerte").waitFor();
  step("récompenses : ajout d'une récompense");

  // Messages automatiques : lien d'avis Google puis activation de la demande d'avis
  await page.getByRole("button", { name: "Messages automatiques" }).click();
  await page.getByLabel("Lien de votre fiche Google (« Demander des avis »)").fill("https://g.page/r/demo-boulangerie/review");
  await page.getByRole("button", { name: "Enregistrer le lien" }).click();
  await page.getByText("Lien d'avis Google enregistré").waitFor();
  const review = page.locator(".card", { has: page.getByRole("heading", { name: /Demande d'avis Google/ }) });
  await review.getByRole("button", { name: "Activer" }).click();
  await page.getByText("Demande d'avis Google : activé et enregistré").waitFor();
  await shot(page, "g2b-automatiques");
  step("messages automatiques : lien Google enregistré, demande d'avis activée");

  // Règles : bonus de fidélité, heures creuses, 2 points par euro
  await page.getByRole("button", { name: "Règles des points" }).click();
  await page.getByText("Bonus de fidélité", { exact: true }).waitFor();
  await page.getByLabel("Nombre de visites").fill("8");
  await page.getByRole("button", { name: "Enregistrer les bonus" }).click();
  await page.getByText("Bonus de fidélité enregistrés").waitFor();
  await page.getByRole("button", { name: "+ Ajouter un créneau" }).click();
  await page.getByRole("button", { name: "Enregistrer les heures creuses" }).click();
  await page.getByText("Heures creuses enregistrées").waitFor();
  step("bonus de fidélité (visite fêtée toutes les 8 visites) et heures creuses enregistrés");
  await page.getByLabel("Points par euro").fill("2");
  await shot(page, "g3-regles");
  await page.getByRole("button", { name: "Enregistrer les règles" }).click();
  await page.getByText("Règles enregistrées").waitFor();
  step("règles : 2 points par euro");

  // Roue et niveaux
  await page.getByRole("button", { name: "Roue et niveaux" }).click();
  await page.getByText("Niveaux de fidélité").waitFor();
  await shot(page, "g4-roue-niveaux");
  await page.getByRole("button", { name: "Enregistrer la roue" }).click();
  await page.getByText("Roue enregistrée").waitFor();
  step("roue et niveaux : affichage et enregistrement");

  // Apparence : style, titre, couleur
  await page.getByRole("button", { name: "Apparence" }).click();
  await page.getByRole("button", { name: /Chaleureux/ }).click();
  await page.getByLabel("Titre d'accueil").fill("Votre fidélité a bon goût");
  await page.getByLabel("Code couleur").fill("#0f766e");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.getByText("Apparence enregistrée").first().waitFor();
  await shot(page, "g5-apparence");
  step("apparence : style « Chaleureux », titre et couleur enregistrés");

  // Équipe : un vendeur avec un simple code (pour encaisser sur la tablette)
  await page.getByRole("button", { name: "Équipe" }).click();
  await page.getByLabel("Prénom").fill("Inès");
  await page.getByLabel("Code vendeur (4 à 6 chiffres)").fill("2580");
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await page.getByText("Membre ajouté").waitFor();
  await page.getByText(/Inès/).first().waitFor();
  await shot(page, "g7-equipe");
  step("équipe : vendeuse « Inès » ajoutée avec un code vendeur");

  // Demandes RGPD
  await page.getByRole("button", { name: "Demandes RGPD" }).click();
  await page.getByPlaceholder(/Prénom \+ 2 derniers/).fill("Léa, …56");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.getByText("à traiter avant le").waitFor();
  await shot(page, "g6-rgpd");
  await page.getByRole("button", { name: "Marquer traitée" }).click();
  await page.getByText("Aucune demande en cours").waitFor();
  step("demandes RGPD : création puis clôture");

  // La caisse applique les nouveaux réglages
  await page.getByRole("link", { name: "Ouvrir la caisse" }).click();
  await page.waitForURL("**/caisse");
  await page.getByPlaceholder("0470 12 34 56").fill("0470123456");
  await page.getByRole("button", { name: "OK" }).click();
  await page.getByText("Baguette offerte").waitFor();
  for (const d of "1000") await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByRole("button", { name: "Valider" }).click();
  const t = await page.getByText(/\+\d+ points pour Léa/).textContent();
  if (!/^\+(2\d|4\d|6\d) points/.test(t)) throw new Error(`Points inattendus : ${t}`);
  step(`caisse : nouvelle récompense visible, 10 € à 2 points/€ → ${t.split(" (")[0]}`);

  console.log("\nBack-office OK");
} finally {
  await browser.close();
}
