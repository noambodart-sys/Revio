import { z } from "zod";
import { systemDb } from "@/server/db";
import { clientIp, rateLimit, readJson, route } from "@/server/http";
import { pairDevice } from "@/server/services/devices";

export const POST = route(async (req) => {
  rateLimit(`pair:${clientIp(req)}`, 10, 15 * 60);
  const { code } = await readJson(req, z.object({ code: z.string().max(20) }));
  return pairDevice(systemDb(), code);
});
