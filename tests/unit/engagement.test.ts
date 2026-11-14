import { describe, expect, it } from "vitest";
import { activePeriod, currentStreak, fullYears, happyHourExtra, localParts, nextPeriod, streakLength } from "@/server/services/engagement";

const p = (dayOfWeek: number, start: string, end: string, multiplierPercent = 200) => {
  const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  return { dayOfWeek, startMinute: m(start), endMinute: m(end), multiplierPercent, active: true };
};

describe("heures creuses", () => {
  // Mardi 17 novembre 2026, 14:30 à Bruxelles = 13:30 UTC (heure d'hiver)
  const tue1430 = new Date("2026-11-17T13:30:00Z");
  it("heure locale du commerce", () => {
    expect(localParts(tue1430)).toEqual({ isoDay: 2, minute: 14 * 60 + 30 });
    // Heure d'été : 1er juillet 2026, 10:00 UTC = 12:00 à Bruxelles
    expect(localParts(new Date("2026-07-01T10:00:00Z"))).toEqual({ isoDay: 3, minute: 12 * 60 });
  });
  it("créneau actif, fin exclue, le plus avantageux gagne", () => {
    expect(activePeriod([p(2, "14:00", "16:00")], tue1430)?.multiplierPercent).toBe(200);
    expect(activePeriod([p(2, "14:00", "14:30")], tue1430)).toBeNull();
    expect(activePeriod([p(3, "14:00", "16:00")], tue1430)).toBeNull();
    expect(activePeriod([p(2, "14:00", "16:00", 150), p(2, "14:00", "15:00", 300)], tue1430)?.multiplierPercent).toBe(300);
    expect(activePeriod([{ ...p(2, "14:00", "16:00"), active: false }], tue1430)).toBeNull();
  });
  it("prochain créneau", () => {
    expect(nextPeriod([p(2, "16:00", "17:00")], tue1430)).toMatchObject({ dayOfWeek: 2, inDays: 0 });
    expect(nextPeriod([p(2, "09:00", "10:00")], tue1430)).toMatchObject({ dayOfWeek: 2, inDays: 7 });
    expect(nextPeriod([p(1, "09:00", "10:00"), p(4, "09:00", "10:00")], tue1430)).toMatchObject({ dayOfWeek: 4, inDays: 2 });
  });
  it("points supplémentaires arrondis à l'inférieur", () => {
    expect(happyHourExtra(13, 200)).toBe(13);
    expect(happyHourExtra(13, 150)).toBe(6);
  });
});

describe("régularité", () => {
  const weeks = ["2026-11-16", "2026-11-09", "2026-11-02", "2026-10-19"];
  it("semaines consécutives", () => {
    expect(streakLength(weeks, "2026-11-16")).toBe(3);
    expect(streakLength(weeks, "2026-10-19")).toBe(1);
    expect(streakLength(weeks, "2026-11-23")).toBe(0);
  });
  it("série en cours : vivante si la semaine passée compte une visite", () => {
    expect(currentStreak(weeks, "2026-11-16")).toEqual({ weeks: 3, visitedThisWeek: true });
    expect(currentStreak(weeks, "2026-11-23")).toEqual({ weeks: 3, visitedThisWeek: false });
    expect(currentStreak(weeks, "2026-11-30")).toEqual({ weeks: 0, visitedThisWeek: false });
  });
  it("années complètes depuis l'inscription", () => {
    const e = new Date("2025-03-10T10:00:00Z");
    expect(fullYears(e, new Date("2026-03-09T10:00:00Z"))).toBe(0);
    expect(fullYears(e, new Date("2026-03-10T10:00:00Z"))).toBe(1);
    expect(fullYears(e, new Date("2028-01-01T00:00:00Z"))).toBe(2);
  });
});
