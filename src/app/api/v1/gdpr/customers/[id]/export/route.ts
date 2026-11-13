import { NextResponse } from "next/server";
import { isUuid, withTenant } from "@/server/db";
import { OWNER_ONLY, requireUser, route } from "@/server/http";
import { notFound } from "@/server/errors";
import { exportCustomerData } from "@/server/services/gdpr";

/** Droit d'accès / portabilité : fichier JSON téléchargeable. */
export const GET = route<{ id: string }>(async (req, { id }) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  if (!isUuid(id)) throw notFound("Client");
  const data = await withTenant(ctx.merchantId, (tx) => exportCustomerData(tx, ctx, id));
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="donnees-client-${id.slice(0, 8)}.json"` },
  });
});
