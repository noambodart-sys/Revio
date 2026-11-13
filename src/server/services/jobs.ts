import { systemDb, withTenant } from "../db";
import { TECH } from "@/config/product";
import { expireInactivePoints } from "./points";
import { applyRetention } from "./gdpr";

/**
 * Tâches quotidiennes, exécutées commerce par commerce dans son propre contexte RLS.
 * À planifier une fois par nuit (cron de l'hébergeur).
 */
export async function runDailyJobs(now = new Date()) {
  const merchants = await systemDb().merchant.findMany({ select: { id: true, name: true } });
  const report: { merchant: string; expired: number; anonymized: number; sessionsClosed: number }[] = [];
  for (const m of merchants) {
    const r = await withTenant(m.id, async (tx) => {
      const sessionsClosed = (
        await tx.kioskSession.updateMany({
          where: { merchantId: m.id, status: { in: ["AWAITING_AUTH", "IDENTIFIED"] }, expiresAt: { lt: now } },
          data: { status: "EXPIRED" },
        })
      ).count;
      const expired = await expireInactivePoints(tx, m.id, now);
      const anonymized = await applyRetention(tx, { merchantId: m.id, actor: { type: "SYSTEM" } }, now, TECH.unverifiedCustomerTtlHours);
      return { expired, anonymized, sessionsClosed };
    });
    report.push({ merchant: m.name, ...r });
  }
  return report;
}
