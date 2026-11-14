/** Génère un nouveau code d'appairage pour le commerce de démo (ou celui passé en argument). */
import "dotenv/config";
import { disconnectAll, systemDb } from "../src/server/db";
import { createPairingCode } from "../src/server/services/devices";

async function main() {
  const slug = process.argv[2] ?? "boulangerie-demo";
  const m = await systemDb().merchant.findUnique({ where: { slug } });
  if (!m) throw new Error(`Commerce introuvable : ${slug}`);
  const p = await createPairingCode(systemDb(), { type: "SYSTEM" }, m.id, "Tablette");
  console.log(p.code);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(disconnectAll);
