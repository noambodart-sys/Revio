import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { DEFAULT_PHONE_COUNTRY } from "@/config/product";
import { badRequest } from "./errors";

/** Normalise un numéro saisi (0470 12 34 56, +32470…, 0032…) au format E.164. */
export function normalizePhone(input: string): string {
  const cleaned = input.replace(/[\s.\-/()]/g, "").replace(/^00/, "+");
  const p = parsePhoneNumberFromString(cleaned, DEFAULT_PHONE_COUNTRY);
  if (!p || !p.isValid()) throw badRequest("INVALID_PHONE", "Numéro de téléphone invalide");
  const type = p.getType();
  if (type && !["MOBILE", "FIXED_LINE_OR_MOBILE"].includes(type)) {
    throw badRequest("PHONE_NOT_MOBILE", "Merci d'utiliser un numéro de GSM");
  }
  return p.number;
}

/** +32470123412 → « +32 4•• •• •• 12 ». Seule forme jamais affichée. */
export function maskPhone(e164: string): string {
  const p = parsePhoneNumberFromString(e164);
  const cc = p?.countryCallingCode ?? "";
  const nsn = p?.nationalNumber ?? e164.replace(/\D/g, "");
  return `+${cc} ${nsn.slice(0, 1)}•• •• •• ${nsn.slice(-2)}`;
}
