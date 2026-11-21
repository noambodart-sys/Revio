import { z } from "zod";
import { isUuid, withTenant } from "@/server/db";
import { readJson, requireDevice, route } from "@/server/http";
import { notFound } from "@/server/errors";
import { counterValidateIdentity } from "@/server/services/counter";

/** Le vendeur confirme l'identité du client depuis la tablette (code PIN client bloqué ou non utilisé). */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireDevice(req);
  if (!isUuid(id)) throw notFound("Passage");
  const b = await readJson(req, z.object({ token: z.string().max(300) }));
  await withTenant(ctx.merchantId, (tx) => counterValidateIdentity(tx, ctx, id, b.token));
  return { ok: true };
});
