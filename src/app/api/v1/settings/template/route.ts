import { z } from "zod";
import { withTenant } from "@/server/db";
import { OWNER_ONLY, readJson, requireUser, route } from "@/server/http";
import { applyTemplate } from "@/server/services/templates";

/** Démarrage rapide : applique le modèle d'un métier. */
export const POST = route(async (req) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  const { key } = await readJson(req, z.object({ key: z.string().max(40) }));
  return withTenant(ctx.merchantId, (tx) => applyTemplate(tx, ctx, key));
});
