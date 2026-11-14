/**
 * Modèles de démarrage par métier : valeurs proposées au commerçant, toutes modifiables
 * ensuite dans le back-office. Ce sont des suggestions, pas des règles en dur.
 */
export interface BusinessTemplate {
  key: string;
  label: string;
  emoji: string;
  color: string;
  pitch: string;
  rules: {
    earnMode: "PER_EURO" | "PER_VISIT";
    pointsPerEuro: number;
    pointsPerVisit: number;
    minPurchaseCents: number;
    visitMilestoneEvery: number | null;
    visitMilestonePoints: number;
    streakWeeks: number | null;
    streakPoints: number;
    anniversaryPoints: number | null;
  };
  rewards: { name: string; pointsCost: number; description?: string }[];
  tiers: { name: string; minPoints: number; bonusPercent: number }[];
  /** Index dans `rewards` pour les lots « récompense ». */
  wheel: { label: string; type: "NOTHING" | "POINTS" | "REWARD"; points?: number; reward?: number; weight: number }[];
  /** Heures creuses suggérées (jour ISO, minutes). */
  bonusPeriods: { dayOfWeek: number; startMinute: number; endMinute: number; multiplierPercent: number }[];
  kioskMessage: string;
}

const H = (h: number, m = 0) => h * 60 + m;

export const BUSINESS_TEMPLATES: BusinessTemplate[] = [
  {
    key: "boulangerie",
    label: "Boulangerie / pâtisserie",
    emoji: "🥐",
    color: "#b45309",
    pitch: "Petits montants, visites fréquentes : on récompense surtout la régularité.",
    rules: { earnMode: "PER_EURO", pointsPerEuro: 2, pointsPerVisit: 5, minPurchaseCents: 0, visitMilestoneEvery: 10, visitMilestonePoints: 20, streakWeeks: 4, streakPoints: 30, anniversaryPoints: 50 },
    rewards: [
      { name: "Croissant offert", pointsCost: 40 },
      { name: "Baguette offerte", pointsCost: 60 },
      { name: "Pâtisserie offerte", pointsCost: 120 },
      { name: "Gâteau 4 parts", pointsCost: 400 },
    ],
    tiers: [
      { name: "Bronze", minPoints: 0, bonusPercent: 0 },
      { name: "Argent", minPoints: 400, bonusPercent: 5 },
      { name: "Or", minPoints: 1200, bonusPercent: 10 },
    ],
    wheel: [
      { label: "Perdu", type: "NOTHING", weight: 55 },
      { label: "+5 points", type: "POINTS", points: 5, weight: 30 },
      { label: "+15 points", type: "POINTS", points: 15, weight: 10 },
      { label: "Croissant", type: "REWARD", reward: 0, weight: 5 },
    ],
    bonusPeriods: [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, startMinute: H(14), endMinute: H(16), multiplierPercent: 200 })),
    kioskMessage: "Points doublés en semaine de 14 h à 16 h !",
  },
  {
    key: "boucherie",
    label: "Boucherie / traiteur",
    emoji: "🥩",
    color: "#b91c1c",
    pitch: "Paniers plus importants : 1 point par euro, des récompenses généreuses.",
    rules: { earnMode: "PER_EURO", pointsPerEuro: 1, pointsPerVisit: 10, minPurchaseCents: 0, visitMilestoneEvery: 10, visitMilestonePoints: 30, streakWeeks: 4, streakPoints: 40, anniversaryPoints: 100 },
    rewards: [
      { name: "Portion de pâté offerte", pointsCost: 60 },
      { name: "5 € de réduction", pointsCost: 150 },
      { name: "Plat préparé offert", pointsCost: 250 },
      { name: "15 € de réduction", pointsCost: 400 },
    ],
    tiers: [
      { name: "Bronze", minPoints: 0, bonusPercent: 0 },
      { name: "Argent", minPoints: 500, bonusPercent: 5 },
      { name: "Or", minPoints: 1500, bonusPercent: 10 },
    ],
    wheel: [
      { label: "Perdu", type: "NOTHING", weight: 55 },
      { label: "+10 points", type: "POINTS", points: 10, weight: 30 },
      { label: "+25 points", type: "POINTS", points: 25, weight: 12 },
      { label: "Pâté offert", type: "REWARD", reward: 0, weight: 3 },
    ],
    bonusPeriods: [2, 3].map((d) => ({ dayOfWeek: d, startMinute: H(9), endMinute: H(11), multiplierPercent: 200 })),
    kioskMessage: "Le mardi et le mercredi matin, vos points comptent double.",
  },
  {
    key: "cafe",
    label: "Café / bar / salon de thé",
    emoji: "☕",
    color: "#7c2d12",
    pitch: "Un passage = des points : la 10e boisson offerte, version moderne.",
    rules: { earnMode: "PER_VISIT", pointsPerEuro: 1, pointsPerVisit: 10, minPurchaseCents: 250, visitMilestoneEvery: 10, visitMilestonePoints: 20, streakWeeks: 3, streakPoints: 20, anniversaryPoints: 50 },
    rewards: [
      { name: "Café offert", pointsCost: 90 },
      { name: "Boisson au choix offerte", pointsCost: 150 },
      { name: "Petit-déjeuner offert", pointsCost: 300 },
    ],
    tiers: [
      { name: "Habitué", minPoints: 0, bonusPercent: 0 },
      { name: "Fidèle", minPoints: 200, bonusPercent: 10 },
      { name: "Pilier du comptoir", minPoints: 600, bonusPercent: 20 },
    ],
    wheel: [
      { label: "Perdu", type: "NOTHING", weight: 60 },
      { label: "+5 points", type: "POINTS", points: 5, weight: 30 },
      { label: "Café offert", type: "REWARD", reward: 0, weight: 10 },
    ],
    bonusPeriods: [1, 2, 3, 4].map((d) => ({ dayOfWeek: d, startMinute: H(15), endMinute: H(17), multiplierPercent: 200 })),
    kioskMessage: "Happy hour fidélité : points ×2 du lundi au jeudi, 15 h – 17 h.",
  },
  {
    key: "coiffeur",
    label: "Coiffeur / institut",
    emoji: "✂️",
    color: "#9d174d",
    pitch: "Visites espacées mais régulières : on fête chaque fidélité.",
    rules: { earnMode: "PER_EURO", pointsPerEuro: 1, pointsPerVisit: 20, minPurchaseCents: 0, visitMilestoneEvery: 5, visitMilestonePoints: 50, streakWeeks: null, streakPoints: 0, anniversaryPoints: 100 },
    rewards: [
      { name: "Soin offert", pointsCost: 150 },
      { name: "10 € de réduction", pointsCost: 250 },
      { name: "Coupe offerte", pointsCost: 500 },
    ],
    tiers: [
      { name: "Client", minPoints: 0, bonusPercent: 0 },
      { name: "VIP", minPoints: 600, bonusPercent: 10 },
    ],
    wheel: [
      { label: "Perdu", type: "NOTHING", weight: 50 },
      { label: "+10 points", type: "POINTS", points: 10, weight: 35 },
      { label: "+30 points", type: "POINTS", points: 30, weight: 15 },
    ],
    bonusPeriods: [2, 3].map((d) => ({ dayOfWeek: d, startMinute: H(9), endMinute: H(12), multiplierPercent: 150 })),
    kioskMessage: "Mardi et mercredi matin : +50 % de points sur vos rendez-vous.",
  },
  {
    key: "librairie",
    label: "Librairie / épicerie fine / boutique",
    emoji: "📚",
    color: "#1d4ed8",
    pitch: "1 point par euro, des bons d'achat, une surprise pour l'anniversaire de fidélité.",
    rules: { earnMode: "PER_EURO", pointsPerEuro: 1, pointsPerVisit: 10, minPurchaseCents: 0, visitMilestoneEvery: 10, visitMilestonePoints: 30, streakWeeks: null, streakPoints: 0, anniversaryPoints: 50 },
    rewards: [
      { name: "5 € de réduction", pointsCost: 150 },
      { name: "10 € de réduction", pointsCost: 280 },
      { name: "20 € de réduction", pointsCost: 520 },
    ],
    tiers: [
      { name: "Lecteur", minPoints: 0, bonusPercent: 0 },
      { name: "Passionné", minPoints: 500, bonusPercent: 5 },
      { name: "Ambassadeur", minPoints: 1500, bonusPercent: 10 },
    ],
    wheel: [
      { label: "Perdu", type: "NOTHING", weight: 55 },
      { label: "+10 points", type: "POINTS", points: 10, weight: 35 },
      { label: "+30 points", type: "POINTS", points: 30, weight: 10 },
    ],
    bonusPeriods: [{ dayOfWeek: 3, startMinute: H(14), endMinute: H(18), multiplierPercent: 200 }],
    kioskMessage: "Le mercredi après-midi, vos points comptent double.",
  },
];

export const templateByKey = (key: string) => BUSINESS_TEMPLATES.find((t) => t.key === key) ?? null;
