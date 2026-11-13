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
