import { z } from "zod";
import type { BonusPeriod, PointTransactionType, Rules } from "@prisma/client";
import type { Tx } from "../db";
import type { Ctx } from "../context";
import { audit } from "../audit";
import { BUSINESS_TIMEZONE } from "@/config/product";

// ---------------------------------------------------------------------------
// Calculs purs (testés unitairement)
// ---------------------------------------------------------------------------

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Jour ISO (1 = lundi) et minute du jour, à l'heure locale du commerce. */
export function localParts(d: Date): { isoDay: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TIMEZONE, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  return { isoDay: WEEKDAY[get("weekday")] ?? 1, minute: Number(get("hour")) * 60 + Number(get("minute")) };
}

type Period = Pick<BonusPeriod, "dayOfWeek" | "startMinute" | "endMinute" | "multiplierPercent" | "active">;

/** Créneau actif à cet instant (le plus avantageux si plusieurs se chevauchent). */
export function activePeriod<T extends Period>(periods: T[], at: Date): T | null {
  const { isoDay, minute } = localParts(at);
  const hits = periods.filter((p) => p.active && p.dayOfWeek === isoDay && minute >= p.startMinute && minute < p.endMinute);
  return hits.sort((a, b) => b.multiplierPercent - a.multiplierPercent)[0] ?? null;
}

/** Prochain créneau (dans les 7 jours), pour l'annoncer sur la tablette. */
export function nextPeriod<T extends Period>(periods: T[], at: Date): (T & { inDays: number }) | null {
  const { isoDay, minute } = localParts(at);
  let best: (T & { inDays: number }) | null = null;
  let bestDelta = Infinity;
  for (const p of periods.filter((x) => x.active)) {
    let days = (p.dayOfWeek - isoDay + 7) % 7;
    if (days === 0 && p.startMinute <= minute) days = 7;
    const delta = days * 1440 + p.startMinute - minute;
    if (delta < bestDelta) {
      bestDelta = delta;
      best = { ...p, inDays: days };
    }
  }
  return best;
}

export const happyHourExtra = (basePoints: number, multiplierPercent: number) => Math.floor((basePoints * (multiplierPercent - 100)) / 100);

/** Lundi précédent d'une semaine « AAAA-MM-JJ ». */
function previousWeek(week: string): string {
  const d = new Date(`${week}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

/** Nombre de semaines consécutives avec au moins une visite, en remontant depuis `fromWeek`. */
export function streakLength(weeksWithVisit: Iterable<string>, fromWeek: string): number {
  const set = new Set(weeksWithVisit);
  let n = 0;
  for (let w = fromWeek; set.has(w); w = previousWeek(w)) n++;
  return n;
}

/** Série en cours : elle reste « vivante » tant que la semaine précédente compte une visite. */
export function currentStreak(weeksWithVisit: string[], thisWeek: string) {
  const set = new Set(weeksWithVisit);
  if (set.has(thisWeek)) return { weeks: streakLength(set, thisWeek), visitedThisWeek: true };
  return { weeks: streakLength(set, previousWeek(thisWeek)), visitedThisWeek: false };
}

/** Nombre d'anniversaires d'inscription complets à la date donnée. */
export function fullYears(enrolledAt: Date, at: Date): number {
  let years = at.getUTCFullYear() - enrolledAt.getUTCFullYear();
  const anniv = new Date(enrolledAt);
  anniv.setUTCFullYear(enrolledAt.getUTCFullYear() + years);
  if (anniv > at) years--;
  return Math.max(0, years);
}

export function anniversaryDate(enrolledAt: Date, years: number): Date {
  const d = new Date(enrolledAt);
  d.setUTCFullYear(enrolledAt.getUTCFullYear() + years);
  return d;
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/** Semaines (lundi, heure locale) où le client a fait au moins un achat. */
export async function visitWeeks(tx: Tx, customerId: string): Promise<string[]> {
  const rows = await tx.$queryRaw<{ w: string }[]>`
    SELECT DISTINCT to_char(date_trunc('week', occurred_at AT TIME ZONE 'UTC' AT TIME ZONE ${BUSINESS_TIMEZONE}), 'YYYY-MM-DD') AS w
    FROM point_transactions WHERE customer_id = ${customerId}::uuid AND type = 'EARN'
    ORDER BY w DESC LIMIT 120`;
  return rows.map((r) => r.w);
}

export async function weekOf(tx: Tx, at: Date): Promise<string> {
  const rows = await tx.$queryRaw<{ w: string }[]>`
    SELECT to_char(date_trunc('week', ${at.toISOString()}::timestamptz AT TIME ZONE ${BUSINESS_TIMEZONE}), 'YYYY-MM-DD') AS w`;
  return rows[0].w;
}

export const visitCount = (tx: Tx, customerId: string) => tx.pointTransaction.count({ where: { customerId, type: "EARN" } });

/** Indicateurs de régularité affichés à la tablette et en caisse. */
export async function engagementSummary(tx: Tx, rules: Rules, customerId: string, now = new Date()) {
  const [visits, weeks, thisWeek] = await Promise.all([visitCount(tx, customerId), visitWeeks(tx, customerId), weekOf(tx, now)]);
  const streak = currentStreak(weeks, thisWeek);
  const every = rules.visitMilestoneEvery;
  return {
    visits,
    streakWeeks: streak.weeks,
    visitedThisWeek: streak.visitedThisWeek,
    streakGoal: rules.streakWeeks ? { weeks: rules.streakWeeks, points: rules.streakPoints } : null,
    nextMilestone: every ? { inVisits: every - (visits % every), points: rules.visitMilestonePoints, atVisit: visits + every - (visits % every) } : null,
  };
}

// ---------------------------------------------------------------------------
// Bonus d'un achat
// ---------------------------------------------------------------------------

export interface BonusLine {
  type: Extract<PointTransactionType, "HAPPY_HOUR_BONUS" | "VISIT_MILESTONE_BONUS" | "STREAK_BONUS" | "ANNIVERSARY_BONUS">;
  points: number;
  detail: Record<string, number>;
}

/**
 * Bonus mérités par un achat, calculés AVANT l'insertion de la ligne EARN.
 * Tous viennent des règles du commerçant ; aucun montant n'est écrit en dur.
 */
export async function purchaseBonuses(
  tx: Tx,
  rules: Rules,
  customer: { id: string; enrolledAt: Date },
  basePoints: number,
  occurredAt: Date,
): Promise<BonusLine[]> {
  const out: BonusLine[] = [];

  const periods = await tx.bonusPeriod.findMany({ where: { merchantId: rules.merchantId, active: true } });
  const hh = activePeriod(periods, occurredAt);
  if (hh && basePoints > 0) {
    const extra = happyHourExtra(basePoints, hh.multiplierPercent);
    if (extra > 0) out.push({ type: "HAPPY_HOUR_BONUS", points: extra, detail: { multiplierPercent: hh.multiplierPercent } });
  }

  if (rules.visitMilestoneEvery) {
    const visits = (await visitCount(tx, customer.id)) + 1;
    if (visits % rules.visitMilestoneEvery === 0) out.push({ type: "VISIT_MILESTONE_BONUS", points: rules.visitMilestonePoints, detail: { visit: visits } });
  }

  if (rules.streakWeeks) {
    const [weeks, thisWeek] = await Promise.all([visitWeeks(tx, customer.id), weekOf(tx, occurredAt)]);
    if (!weeks.includes(thisWeek)) {
      const streak = streakLength([...weeks, thisWeek], thisWeek);
      if (streak % rules.streakWeeks === 0) out.push({ type: "STREAK_BONUS", points: rules.streakPoints, detail: { weeks: streak } });
    }
  }

  if (rules.anniversaryPoints) {
    const years = fullYears(customer.enrolledAt, occurredAt);
    if (years >= 1) {
      const already = await tx.pointTransaction.count({
        where: { customerId: customer.id, type: "ANNIVERSARY_BONUS", occurredAt: { gte: anniversaryDate(customer.enrolledAt, years) } },
      });
      if (already === 0) out.push({ type: "ANNIVERSARY_BONUS", points: rules.anniversaryPoints, detail: { years } });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Réglage des heures creuses
// ---------------------------------------------------------------------------

export const bonusPeriodsSchema = z
  .array(
    z
      .object({
        dayOfWeek: z.number().int().min(1).max(7),
        startMinute: z.number().int().min(0).max(1439),
        endMinute: z.number().int().min(1).max(1440),
        multiplierPercent: z.number().int().min(110).max(500),
      })
      .refine((p) => p.startMinute < p.endMinute, "L'heure de fin doit suivre l'heure de début"),
  )
  .max(21);

export async function replaceBonusPeriods(tx: Tx, ctx: Ctx, periods: z.infer<typeof bonusPeriodsSchema>) {
  await tx.bonusPeriod.deleteMany({ where: { merchantId: ctx.merchantId } });
  if (periods.length) await tx.bonusPeriod.createMany({ data: periods.map((p) => ({ ...p, merchantId: ctx.merchantId })) });
  await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "bonus_periods.replace", entityType: "bonus_periods", metadata: periods });
  return listBonusPeriods(tx, ctx.merchantId);
}

export const listBonusPeriods = (tx: Tx, merchantId: string) =>
  tx.bonusPeriod.findMany({ where: { merchantId }, orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] });

/** État des heures creuses pour l'affichage (tablette, caisse). */
export async function happyHourStatus(tx: Tx, merchantId: string, now = new Date()) {
  const periods = await tx.bonusPeriod.findMany({ where: { merchantId, active: true } });
  const active = activePeriod(periods, now);
  const next = active ? null : nextPeriod(periods, now);
  return {
    active: active ? { multiplierPercent: active.multiplierPercent, endMinute: active.endMinute } : null,
    next: next ? { multiplierPercent: next.multiplierPercent, dayOfWeek: next.dayOfWeek, startMinute: next.startMinute, endMinute: next.endMinute, inDays: next.inDays } : null,
  };
}
