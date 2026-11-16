/**
 * Seul endroit où le nom du produit est défini. Il est provisoire :
 * le changer ici suffit (interface, SMS, textes juridiques).
 */
export const PRODUCT_NAME = "Revio";

/** Fuseau horaire des commerces (journée « calendaire » pour la roue et le plafond quotidien). */
export const BUSINESS_TIMEZONE = "Europe/Brussels";

/** Pays par défaut pour interpréter un numéro saisi sans indicatif. */
export const DEFAULT_PHONE_COUNTRY = "BE" as const;

/** Paramètres techniques (pas des règles commerciales : celles-ci sont dans la table rules). */
export const TECH = {
  kioskSessionTtlSeconds: 5 * 60,
  smsCodeTtlSeconds: 10 * 60,
  smsCodeMaxAttempts: 5,
  smsCodesPerHour: 3,
  pinLockMinutes: 15,
  userSessionHours: 12,
  userMaxFailedLogins: 5,
  userLockMinutes: 15,
  pairingCodeTtlMinutes: 30,
  unverifiedCustomerTtlHours: 24,
} as const;

/** Envoi des SMS d'offres (campagnes). */
export const SMS_MARKETING = {
  /** Plage d'envoi autorisée, heure locale du commerce (bonne pratique : jamais tôt, tard ou le dimanche). */
  sendWindow: { startHour: 9, endHour: 20, sunday: false },
  /** Mention de désinscription ajoutée à chaque SMS d'offre. */
  optOutMention: "STOP SMS : répondez STOP",
  /** Estimation affichée au commerçant (à aligner sur le tarif réel du fournisseur). */
  estimatedCostCentsPerSms: 8,
  /** Nombre maximum de parties de 160 caractères par message. */
  maxParts: 2,
} as const;
