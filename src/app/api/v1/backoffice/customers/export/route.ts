import { NextResponse } from "next/server";
import { withTenant } from "@/server/db";
import { OWNER_ONLY, requireUser, route } from "@/server/http";
import { exportCustomersCsv } from "@/server/services/backoffice";

export const GET = route(async (req) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  const csv = await withTenant(ctx.merchantId, (tx) => exportCustomersCsv(tx, ctx));
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="clients-${date}.csv"` },
  });
});
