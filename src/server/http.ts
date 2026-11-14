import { NextResponse, type NextRequest } from "next/server";
import { Prisma, type UserRole } from "@prisma/client";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { AppError } from "./errors";
import { systemDb } from "./db";
import { env } from "./env";
import type { Ctx } from "./context";
import { authenticateDevice } from "./services/devices";
import { getSessionUser, SESSION_COOKIE, type SessionUser } from "./services/auth";

// ---------------------------------------------------------------------------
// Réponses et erreurs
// ---------------------------------------------------------------------------

export function errorResponse(e: unknown) {
  if (e instanceof AppError) {
    return NextResponse.json({ error: { code: e.code, message: e.message, ...e.details } }, { status: e.status });
  }
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Données invalides", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } },
      { status: 400 },
    );
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    return NextResponse.json({ error: { code: "CONFLICT", message: "Cette opération a déjà été effectuée" } }, { status: 409 });
  }
  console.error(e);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Erreur interne, réessayez" } }, { status: 500 });
}

type RouteCtx<P> = { params: Promise<P> };

/** Enveloppe une route : gestion des erreurs, JSON, pas de cache. */
export function route<P = Record<string, string>>(fn: (req: NextRequest, params: P) => Promise<unknown>) {
  return async (req: NextRequest, ctx: RouteCtx<P>) => {
    try {
      const params = ctx?.params ? await ctx.params : ({} as P);
      const result = await fn(req, params);
      const res = result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
      res.headers.set("Cache-Control", "no-store");
      return res;
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function readJson<S extends ZodTypeAny>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    throw new AppError(400, "INVALID_JSON", "Requête invalide");
  }
  return schema.parse(data);
}

// ---------------------------------------------------------------------------
// Limitation du nombre de requêtes (mémoire locale : à remplacer par Redis si plusieurs instances)
// ---------------------------------------------------------------------------

const buckets = new Map<string, { count: number; resetAt: number }>();

export function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

export function rateLimit(key: string, max: number, windowSeconds: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    if (buckets.size > 50_000) for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
    return;
  }
  if (++b.count > max) throw new AppError(429, "RATE_LIMITED", "Trop de tentatives, patientez un instant");
}

// ---------------------------------------------------------------------------
// Authentification
// ---------------------------------------------------------------------------

/** Tablette : jeton propre à l'appareil dans l'en-tête Authorization. */
export async function requireDevice(req: NextRequest): Promise<Ctx & { merchant: { id: string; name: string } }> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const d = await authenticateDevice(systemDb(), token);
  if (!d) throw new AppError(401, "DEVICE_UNAUTHORIZED", "Tablette non appairée ou révoquée");
  rateLimit(`device:${d.deviceId}`, 120, 60);
  return { merchantId: d.merchantId, actor: { type: "DEVICE", deviceId: d.deviceId }, merchant: d.merchant };
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Protection CSRF des routes à cookie : la requête doit venir de notre propre site
 * (même hôte, ou l'adresse publique APP_URL quand on est derrière un proxy / tunnel).
 */
function assertSameOrigin(req: NextRequest) {
  if (!MUTATING.has(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) throw new AppError(403, "CSRF", "Origine refusée");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError(403, "CSRF", "Origine refusée");
  }
  const allowed = new Set<string>();
  for (const h of [req.headers.get("x-forwarded-host"), req.headers.get("host")]) if (h) allowed.add(h);
  try {
    allowed.add(new URL(env().APP_URL).host);
  } catch {
    /* APP_URL invalide : ignoré */
  }
  if (!allowed.has(originHost)) throw new AppError(403, "CSRF", "Origine refusée");
}

export async function requireUser(req: NextRequest, roles: UserRole[]): Promise<{ user: SessionUser; ctx: Ctx }> {
  assertSameOrigin(req);
  const user = await getSessionUser(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) throw new AppError(401, "UNAUTHENTICATED", "Veuillez vous connecter");
  if (!roles.includes(user.role)) throw new AppError(403, "FORBIDDEN", "Accès réservé");
  rateLimit(`user:${user.id}`, 300, 60);
  return { user, ctx: { merchantId: user.merchantId ?? "", actor: { type: "USER", userId: user.id, role: user.role } } };
}

export const STAFF_ROLES: UserRole[] = ["OWNER", "STAFF"];
export const OWNER_ONLY: UserRole[] = ["OWNER"];
export const ADMIN_ONLY: UserRole[] = ["REVIO_ADMIN"];

export { assertSameOrigin };
