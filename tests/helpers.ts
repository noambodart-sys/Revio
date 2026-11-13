import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { setSmsProvider } from "@/server/sms";
import { systemDb, withTenant } from "@/server/db";
import { LEGAL_TEMPLATES, LEGAL_TEMPLATES_VERSION } from "@/server/legal-templates";
import { createMerchant } from "@/server/services/merchants";
import { createPairingCode, pairDevice } from "@/server/services/devices";
import type { Ctx } from "@/server/context";

export const SYSTEM = { type: "SYSTEM" } as const;

/** Vide toutes les tables (rôle propriétaire). */
export async function resetDb() {
  if (!process.env.MIGRATION_DATABASE_URL?.includes("revio_test")) throw new Error("Refus : base de test attendue");
  const owner = new PrismaClient({ datasourceUrl: process.env.MIGRATION_DATABASE_URL });
  const tables = await owner.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await owner.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
  await owner.$disconnect();
  const db = systemDb();
  for (const [type, content] of Object.entries(LEGAL_TEMPLATES)) {
    await db.legalDocument.create({
      data: { merchantId: null, type: type as never, version: LEGAL_TEMPLATES_VERSION, content, contentHash: createHash("sha256").update(content).digest("hex") },
    });
  }
}

let n = 0;
export async function makeMerchant(name = "Commerce") {
  n++;
  const m = await createMerchant(SYSTEM, {
    name: `${name} ${n}`,
    slug: `commerce-${n}-${Date.now()}`,
    plan: "PRO",
    owner: { email: `owner${n}-${Date.now()}@test.local`, displayName: "Owner", password: "mot-de-passe-solide" },
  });
  const owner = await systemDb().user.findFirstOrThrow({ where: { merchantId: m.id } });
  const pairing = await createPairingCode(systemDb(), SYSTEM, m.id, "Tablette test");
  const { deviceId } = await pairDevice(systemDb(), pairing.code);
  const deviceCtx: Ctx = { merchantId: m.id, actor: { type: "DEVICE", deviceId } };
  const staffCtx: Ctx = { merchantId: m.id, actor: { type: "USER", userId: owner.id, role: "OWNER" } };
  return { merchant: m, owner, deviceId, deviceCtx, staffCtx, tenant: <T>(fn: Parameters<typeof withTenant<T>>[1]) => withTenant(m.id, fn) };
}

/** Capture les SMS envoyés pour lire le code. */
export function captureSms() {
  const sent: { to: string; text: string }[] = [];
  setSmsProvider({ send: async (to, text) => void sent.push({ to, text }) });
  return {
    sent,
    lastCode: () => {
      const m = sent.at(-1)?.text.match(/(\d{6})/);
      if (!m) throw new Error("Aucun code SMS");
      return m[1];
    },
  };
}
