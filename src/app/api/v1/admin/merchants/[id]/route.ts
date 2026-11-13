import { isUuid } from "@/server/db";
import { ADMIN_ONLY, requireUser, route } from "@/server/http";
import { notFound } from "@/server/errors";
import { getMerchantDetail } from "@/server/services/merchants";

export const GET = route<{ id: string }>(async (req, { id }) => {
  await requireUser(req, ADMIN_ONLY);
  if (!isUuid(id)) throw notFound("Commerce");
  return getMerchantDetail(id);
});
