/**
 * Modèles de SMS d'offres. Le commerçant remplit 1 à 3 champs ; les variables
 * entre accolades propres à chaque client ({prenom}, {points}…) sont remplies à l'envoi.
 * Textes sans emoji ni lettres hors alphabet SMS (ê, ô, î, ç, â) : un SMS reste ainsi
 * à 160 caractères au lieu de 70. Les accents é, è, à, ù font partie de l'alphabet SMS.
 */
export interface MessageTemplate {
  key: string;
  icon: string;
  label: string;
  hint: string;
  fields: { key: string; label: string; placeholder: string }[];
  text: string;
  /** Offre affichée au comptoir (vide = pas d'offre). */
  offer: string | null;
  offerDays: number;
  suggestedSegment: string;
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    key: "promo",
    icon: "🏷️",
    label: "Une promo",
    hint: "Une réduction sur un produit, pour une période",
    fields: [
      { key: "remise", label: "La réduction", placeholder: "-20 %" },
      { key: "produit", label: "Sur quoi ?", placeholder: "les croissants" },
      { key: "quand", label: "Quand ?", placeholder: "ce week-end" },
    ],
    text: "Bonjour {prenom} ! {remise} sur {produit} {quand} chez {commerce}. On vous attend !",
    offer: "{remise} sur {produit}",
    offerDays: 7,
    suggestedSegment: "regulars",
  },
  {
    key: "missyou",
    icon: "💌",
    label: "Vous nous manquez",
    hint: "Faire revenir les clients qu'on ne voit plus",
    fields: [{ key: "cadeau", label: "Le petit cadeau", placeholder: "un café offert" }],
    text: "Bonjour {prenom}, cela fait longtemps ! Pour votre retour chez {commerce}, {cadeau} vous attend.",
    offer: "{cadeau}",
    offerDays: 14,
    suggestedSegment: "lapsed",
  },
  {
    key: "new",
    icon: "✨",
    label: "Une nouveauté",
    hint: "Annoncer un nouveau produit ou service",
    fields: [{ key: "nouveaute", label: "La nouveauté", placeholder: "notre pain aux noix" }],
    text: "Nouveau chez {commerce} : {nouveaute} ! Venez le découvrir {prenom}, on vous attend.",
    offer: null,
    offerDays: 7,
    suggestedSegment: "all",
  },
  {
    key: "event",
    icon: "📅",
    label: "Un événement",
    hint: "Dégustation, fermeture, horaires spéciaux…",
    fields: [
      { key: "evenement", label: "L'événement", placeholder: "dégustation de fromages" },
      { key: "date", label: "Quand ?", placeholder: "samedi de 10 h à 13 h" },
    ],
    text: "{prenom}, {commerce} vous invite : {evenement} {date}. Au plaisir de vous voir !",
    offer: null,
    offerDays: 7,
    suggestedSegment: "all",
  },
  {
    key: "double",
    icon: "⚡",
    label: "Points doublés",
    hint: "Attirer du monde sur un moment calme",
    fields: [{ key: "quand", label: "Quand ?", placeholder: "mardi après-midi" }],
    text: "{prenom}, vos points comptent double {quand} chez {commerce} ! Vous avez déjà {points} points.",
    offer: null,
    offerDays: 7,
    suggestedSegment: "regulars",
  },
  {
    key: "almost",
    icon: "🎁",
    label: "Récompense toute proche",
    hint: "Prévenir ceux à qui il manque peu de points",
    fields: [],
    text: "{prenom}, plus que {points_manquants} points pour votre {recompense} chez {commerce} ! On vous attend.",
    offer: null,
    offerDays: 7,
    suggestedSegment: "nearReward",
  },
  {
    key: "anniversary",
    icon: "🎂",
    label: "Anniversaire de fidélité",
    hint: "Remercier ceux qui sont là depuis un an ou plus",
    fields: [{ key: "cadeau", label: "Le cadeau", placeholder: "une viennoiserie offerte" }],
    text: "Joyeux anniversaire de fidélité {prenom} ! Pour vous remercier, {cadeau} vous attend chez {commerce}.",
    offer: "{cadeau}",
    offerDays: 30,
    suggestedSegment: "anniversary",
  },
  {
    key: "free",
    icon: "✏️",
    label: "Message libre",
    hint: "Écrire votre propre texte",
    fields: [],
    text: "",
    offer: null,
    offerDays: 7,
    suggestedSegment: "all",
  },
];

export const messageTemplateByKey = (key: string) => MESSAGE_TEMPLATES.find((t) => t.key === key) ?? null;

/** Variables remplies pour chaque client à l'envoi. */
export const RECIPIENT_VARIABLES = ["prenom", "commerce", "points", "points_manquants", "recompense"] as const;
