import { withTenant } from "@/server/db";
import { OWNER_ONLY, readJson, requireUser, route } from "@/server/http";
import { automationUpdateSchema, updateAutomation } from "@/server/services/automations";

export const PATCH = route<{ kind: string }>(async (req, { kind }) => {
  const { ctx } = await requireUser(req, OWNER_ONLY);
  const body = await readJson(req, automationUpdateSchema);
  await withTenant(ctx.merchantId, (tx) => updateAutomation(tx, ctx, kind, body));
  return { ok: true };
});
