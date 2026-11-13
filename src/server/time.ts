import { BUSINESS_TIMEZONE } from "@/config/product";

/** Date calendaire locale du commerce (AAAA-MM-JJ). */
export function businessDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Valeur à stocker dans une colonne @db.Date. */
export const businessDateValue = (d = new Date()) => new Date(`${businessDate(d)}T00:00:00Z`);

export const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
export const addSeconds = (d: Date, s: number) => new Date(d.getTime() + s * 1000);
export function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + months);
  return r;
}
