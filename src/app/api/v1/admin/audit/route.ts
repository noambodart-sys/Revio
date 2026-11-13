import { isUuid } from "@/server/db";
import { ADMIN_ONLY, requireUser, route } from "@/server/http";
import { listAuditLog } from "@/server/services/merchants";

export const GET = route(async (req) => {
  await requireUser(req, ADMIN_ONLY);
  const m = req.nextUrl.searchParams.get("merchantId");
  return listAuditLog(isUuid(m) ? m : null, 200);
});
