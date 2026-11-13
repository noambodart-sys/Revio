import { withTenant } from "@/server/db";
import { requireDevice, route } from "@/server/http";
import { getRules } from "@/server/services/rules";
import { currentLegalDocument, renderLegalText } from "@/server/services/consents";
import { PRODUCT_NAME } from "@/config/product";

/** Configuration de la tablette : identité visuelle, réglages d'affichage, textes juridiques à jour. */
export const GET = route(async (req) => {
  const ctx = await requireDevice(req);
  return withTenant(ctx.merchantId, async (tx) => {
    const m = await tx.merchant.findUniqueOrThrow({ where: { id: ctx.merchantId } });
    const rules = await getRules(tx, ctx.merchantId);
    const vars = {
      merchant_name: m.name,
      merchant_address: [m.addressLine1, [m.postalCode, m.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "adresse à compléter",
      merchant_vat: m.vatNumber ?? "à compléter",
      product_name: PRODUCT_NAME,
      retention_months: String(rules.inactivityRetentionMonths),
    };
    const legal = Object.fromEntries(
      await Promise.all(
        (["TERMS", "PRIVACY_POLICY", "MARKETING_SMS", "MARKETING_EMAIL"] as const).map(async (t) => {
          const d = await currentLegalDocument(tx, ctx.merchantId, t);
          return [t, { version: d.version, content: renderLegalText(d.content, vars) }];
        }),
      ),
    );
    return {
      productName: PRODUCT_NAME,
      merchant: { name: m.name, logoUrl: m.logoUrl, primaryColor: m.primaryColor, secondaryColor: m.secondaryColor },
      rules: {
        identificationMode: rules.identificationMode,
        kioskResetSeconds: rules.kioskResetSeconds,
        wheelEnabled: rules.wheelEnabled,
        earnMode: rules.earnMode,
        pointsPerEuro: Number(rules.pointsPerEuro),
        pointsPerVisit: rules.pointsPerVisit,
      },
      legal,
    };
  });
});
