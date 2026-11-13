import { NextResponse } from "next/server";
import { assertSameOrigin, route } from "@/server/http";
import { logout, SESSION_COOKIE } from "@/server/services/auth";

export const POST = route(async (req) => {
  assertSameOrigin(req);
  await logout(req.cookies.get(SESSION_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
