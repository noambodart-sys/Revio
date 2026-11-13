import { z } from "zod";
import { NextResponse } from "next/server";
import { assertSameOrigin, clientIp, rateLimit, readJson, route } from "@/server/http";
import { login, SESSION_COOKIE } from "@/server/services/auth";
import { env } from "@/server/env";

export const POST = route(async (req) => {
  assertSameOrigin(req);
  rateLimit(`login:${clientIp(req)}`, 20, 15 * 60);
  const body = await readJson(req, z.object({ email: z.string().max(200), password: z.string().max(200), totp: z.string().max(10).nullish() }));
  const { token, expiresAt, user } = await login(body.email, body.password, body.totp);
  const res = NextResponse.json({ ok: true, role: user.role });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
  return res;
});
