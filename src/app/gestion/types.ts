export interface Features { dashboard: boolean; wheel: boolean; tiers: boolean }

export interface RulesDto {
  earnMode: "PER_EURO" | "PER_VISIT";
  pointsPerEuro: string | number;
  pointsPerVisit: number;
  minPurchaseCents: number;
  identificationMode: "PIN" | "STAFF_VALIDATION";
  pinMaxAttempts: number;
  pointsExpiryMonths: number;
  expiryReminderDays: number;
  inactivityRetentionMonths: number;
  tiersEnabled: boolean;
  tierWindowMonths: number;
  wheelEnabled: boolean;
  dailyPointsCap: number | null;
  adjustmentAlertDailyCount: number;
  kioskResetSeconds: number;
  visitMilestoneEvery: number | null;
  visitMilestonePoints: number;
  streakWeeks: number | null;
  streakPoints: number;
  anniversaryPoints: number | null;
  smsMaxPerMonth: number;
}

export interface BonusPeriod { dayOfWeek: number; startMinute: number; endMinute: number; multiplierPercent: number }
export interface TemplateInfo { key: string; label: string; emoji: string; pitch: string }

export interface Tier { id?: string; name: string; minPoints: number; bonusPercent: number }
export interface WheelPrize { id?: string; label: string; type: "NOTHING" | "POINTS" | "REWARD"; points: number | null; rewardId: string | null; weight: number }
export interface Reward { id: string; name: string; description: string | null; pointsCost: number; stock: number | null; active: boolean }

export interface Settings {
  merchant: {
    name: string; plan: "ESSENTIEL" | "PRO"; primaryColor: string | null; logoUrl: string | null; kioskMessage: string | null;
    kioskTitle: string | null; kioskTheme: string; kioskBackground: string | null; googleReviewUrl: string | null;
    businessType: string | null; subscriptionStatus: string; trialEndsAt: string | null;
  };
  bonusPeriods: BonusPeriod[];
  templates: TemplateInfo[];
  counts: { rewards: number; customers: number };
  features: Features;
  rules: RulesDto;
  tiers: Tier[];
  wheelPrizes: WheelPrize[];
}

export type Flash = (ok: boolean, text: string) => void;
