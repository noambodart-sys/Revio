import { z } from "zod";
import { withTenant } from "@/server/db";
import { rateLimit, readJson, requireDevice, route } from "@/server/http";
import { enrollFromKiosk } from "@/server/services/kiosk";

const schema = z.object({
  phone: z.string().min(6).max(20),
  firstName: z.string().max(40).nullish(),
  acceptTerms: z.boolean(),
  confirmAge16: z.boolean(),
  marketingSms: z.boolean(),
  marketingEmail: z.boolean(),
});

export const POST = route(async (req) => {
  const ctx = await requireDevice(req);
  rateLimit(`enroll:${ctx.merchantId}`, 20, 60);
  const body = await readJson(req, schema);
  return withTenant(ctx.merchantId, (tx) => enrollFromKiosk(tx, ctx, body));
});
