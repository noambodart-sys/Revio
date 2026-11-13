import { withTenant } from "@/server/db";
import { requireUser, route, STAFF_ROLES } from "@/server/http";
import { badRequest } from "@/server/errors";
import { normalizePhone } from "@/server/phone";
import { customerSummary, findCustomerByPhone } from "@/server/services/customers";

/** Recherche par numéro (exact, via l'empreinte HMAC : jamais de recherche en clair). */
export const GET = route(async (req) => {
  const { ctx } = await requireUser(req, STAFF_ROLES);
  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone) throw badRequest("PHONE_REQUIRED", "Indiquez un numéro");
  const e164 = normalizePhone(phone);
  return withTenant(ctx.merchantId, async (tx) => {
    const c = await findCustomerByPhone(tx, ctx.merchantId, e164);
    return { customer: c ? await customerSummary(tx, c.id) : null };
  });
});
