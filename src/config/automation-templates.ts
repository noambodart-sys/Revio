/**
 * Pilote automatique : messages envoyés tout seuls au bon moment.
 * Textes par défaut, modifiables par le commerçant. Variables possibles :
 * {prenom} {commerce} {points} {recompense} {offre} {date_expiration} {lien_avis}
 */
export type AutomationKind = "WELCOME" | "REWARD_READY" | "WIN_BACK" | "LOYALTY_ANNIVERSARY" | "POINTS_EXPIRING" | "REVIEW_REQUEST";

export interface AutomationDef {
  kind: AutomationKind;
  label: string;
  when: string;
  defaultMessage: string;
  defaultParams: Record<string, string | number | null>;
  /** Champ de réglage affiché à l'écran. */
  settings: { key: string; label: string; type: "days" | "visits" | "offer" }[];
  /** Ce message peut créer une offre utilisable au comptoir. */
  canOffer: boolean;
}

export const AUTOMATIONS: AutomationDef[] = [
  {
    kind: "WELCOME",
    label: "Bienvenue",
    when: "Le lendemain de l'inscription",
    defaultMessage: "Bienvenue {prenom} dans le programme de fidélité de {commerce} ! Vous avez déjà {points} points. Au plaisir de vous revoir.",
    defaultParams: {},
    settings: [],
    canOffer: false,
  },
  {
    kind: "REWARD_READY",
    label: "Récompense disponible",
    when: "Quand le client a assez de points pour une récompense",
    defaultMessage: "{prenom}, bonne nouvelle : votre {recompense} vous attend chez {commerce} ! Demandez-le à votre prochain passage.",
    defaultParams: {},
    settings: [],
    canOffer: false,
  },
  {
    kind: "WIN_BACK",
    label: "Relance des absents",
    when: "Quand un habitué ne vient plus depuis deux fois son rythme habituel",
    defaultMessage: "{prenom}, cela fait un moment ! Vos {points} points vous attendent chez {commerce}. Au plaisir de vous revoir.",
    defaultParams: { minDays: 30, offer: null, offerDays: 14 },
    settings: [{ key: "minDays", label: "Absent depuis au moins (jours)", type: "days" }, { key: "offer", label: "Petit cadeau au retour (facultatif)", type: "offer" }],
    canOffer: true,
  },
  {
    kind: "LOYALTY_ANNIVERSARY",
    label: "Anniversaire de fidélité",
    when: "Chaque année, à la date d'inscription",
    defaultMessage: "Joyeux anniversaire de fidélité {prenom} ! Merci de votre confiance, toute l'équipe de {commerce}.",
    defaultParams: { offer: null, offerDays: 30 },
    settings: [{ key: "offer", label: "Cadeau d'anniversaire (facultatif)", type: "offer" }],
    canOffer: true,
  },
  {
    kind: "POINTS_EXPIRING",
    label: "Points bientôt expirés",
    when: "Avant que les points expirent (délai réglé dans les règles)",
    defaultMessage: "{prenom}, vos {points} points chez {commerce} expirent le {date_expiration}. Passez nous voir pour les garder !",
    defaultParams: {},
    settings: [],
    canOffer: false,
  },
  {
    kind: "REVIEW_REQUEST",
    label: "Demande d'avis Google",
    when: "Après quelques visites, une seule fois par client",
    defaultMessage: "Merci {prenom} pour votre fidélité ! Votre avis compte beaucoup pour {commerce} : {lien_avis}",
    defaultParams: { afterVisits: 3 },
    settings: [{ key: "afterVisits", label: "Après combien de visites", type: "visits" }],
    canOffer: false,
  },
];

export const automationDef = (kind: string) => AUTOMATIONS.find((a) => a.kind === kind) ?? null;
