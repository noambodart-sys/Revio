import { ADMIN_ONLY, readJson, requireUser, route } from "@/server/http";
import { createMerchant, createMerchantSchema, listMerchants } from "@/server/services/merchants";

export const GET = route(async (req) => {
  await requireUser(req, ADMIN_ONLY);
  return listMerchants();
});

export const POST = route(async (req) => {
  const { ctx } = await requireUser(req, ADMIN_ONLY);
  const body = await readJson(req, createMerchantSchema);
  return createMerchant(ctx.actor, body);
});
