import { z } from "zod";
import { Prisma } from "@prisma/client";
import { withTenant } from "@/server/db";
import { readJson, requireUser, route, STAFF_ROLES } from "@/server/http";
import { recordPurchase } from "@/server/services/points";

const schema = z.object({
  customerId: z.string().uuid(),
  amountCents: z.number().int().min(0).max(1_000_000),
  kioskSessionId: z.string().uuid().nullish(),
  idempotencyKey: z.string().min(8).max(80).nullish(),
  occurredAt: z.coerce.date().nullish(),
});

export const POST = route(async (req) => {
  const { ctx } = await requireUser(req, STAFF_ROLES);
  const body = await readJson(req, schema);
  try {
    return await withTenant(ctx.merchantId, (tx) => recordPurchase(tx, ctx, body));
  } catch (e) {
    // Deux envois simultanés de la même clé : le second relit le résultat du premier
    if (body.idempotencyKey && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return withTenant(ctx.merchantId, (tx) => recordPurchase(tx, ctx, body));
    }
    throw e;
  }
});
