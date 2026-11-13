import { Prisma, PrismaClient } from "@prisma/client";
import { env } from "./env";
import { AppError } from "./errors";

export type Tx = Prisma.TransactionClient;

const g = globalThis as unknown as { __revioAppDb?: PrismaClient; __revioSystemDb?: PrismaClient };

/** Client du rôle revio_app : soumis à la Row Level Security. À n'utiliser que via withTenant(). */
function appDb(): PrismaClient {
  if (!g.__revioAppDb) g.__revioAppDb = new PrismaClient({ datasourceUrl: env().DATABASE_URL });
  return g.__revioAppDb;
}

/**
 * Client du rôle revio_system (BYPASSRLS). Réservé à : authentification (avant de connaître
 * le commerçant), admin Revio, jobs planifiés. Toute écriture doit être auditée.
 */
export function systemDb(): PrismaClient {
  if (!g.__revioSystemDb) g.__revioSystemDb = new PrismaClient({ datasourceUrl: env().SYSTEM_DATABASE_URL });
  return g.__revioSystemDb;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/**
 * Exécute fn dans une transaction où PostgreSQL ne laisse voir que les lignes du commerçant.
 * C'est le SEUL point d'entrée vers les données métier.
 */
export async function withTenant<T>(merchantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!isUuid(merchantId)) throw new AppError(400, "INVALID_TENANT", "Commerce invalide");
  return appDb().$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.merchant_id', ${merchantId}, true)`;
      return fn(tx);
    },
    { timeout: 15_000, maxWait: 5_000 },
  );
}

export async function disconnectAll() {
  await Promise.all([g.__revioAppDb?.$disconnect(), g.__revioSystemDb?.$disconnect()]);
  g.__revioAppDb = undefined;
  g.__revioSystemDb = undefined;
}
