import type { Plan } from "@prisma/client";

/**
 * Contenu des offres (docs/architecture.md, « Offre commerciale »).
 * Essentiel : tablette + caisse, points, récompenses, RGPD.
 * Pro : + tableau de bord / statistiques, roue, niveaux.
 */
export const PLAN_FEATURES: Record<Plan, { dashboard: boolean; wheel: boolean; tiers: boolean }> = {
  ESSENTIEL: { dashboard: false, wheel: false, tiers: false },
  PRO: { dashboard: true, wheel: true, tiers: true },
};

export const PLAN_LABEL: Record<Plan, string> = { ESSENTIEL: "Essentiel", PRO: "Pro" };
