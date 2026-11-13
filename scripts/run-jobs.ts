/** Jobs quotidiens : à lancer une fois par nuit (cron de l'hébergeur). */
import "dotenv/config";
import { disconnectAll } from "../src/server/db";
import { runDailyJobs } from "../src/server/services/jobs";

runDailyJobs()
  .then((report) => {
    for (const r of report) console.log(`${r.merchant} : ${r.expired} solde(s) expiré(s), ${r.anonymized} client(s) anonymisé(s), ${r.sessionsClosed} passage(s) clos`);
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(disconnectAll);
