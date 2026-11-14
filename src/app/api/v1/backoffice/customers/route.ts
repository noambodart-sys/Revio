import { withTenant } from "@/server/db";
import { OWNER_ONLY, requireUser, route } from "@/server/http";
import { customerListSchema, listCustomers } from "@/server/services/backoffice";

export const GET = route(async (req) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  const input = customerListSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  return withTenant(ctx.merchantId, (tx) => listCustomers(tx, ctx.merchantId, input));
});
