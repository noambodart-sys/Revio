/** Pilote automatique : à lancer toutes les heures (cron). Ne fait rien hors de la plage d'envoi (9 h – 20 h). */
import "dotenv/config";
import { disconnectAll } from "../src/server/db";
import { runAllAutomations } from "../src/server/services/automations";

runAllAutomations()
  .then((report) => {
    for (const r of report) for (const s of r.sent) console.log(`${r.merchant} · ${s.kind} : ${s.sent} SMS envoyé(s), ${s.failed} échec(s)`);
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(disconnectAll);
