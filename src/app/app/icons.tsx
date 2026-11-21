"use client";
import { KIcon, type KioskIconName } from "@/components/KioskIcon";

const SEGMENT: Record<string, KioskIconName> = { all: "users", regulars: "star", lapsed: "moon", new: "leaf", best: "trophy", nearReward: "gift", anniversary: "cake" };
const TEMPLATE: Record<string, KioskIconName> = { promo: "tag", missyou: "heart", new: "sparkle", event: "calendar", double: "bolt", almost: "gift", anniversary: "cake", free: "pen" };
const SUGGESTION: Record<string, KioskIconName> = { lapsed: "heart", near: "gift", anniv: "cake", quiet: "bolt", news: "sparkle" };

export const segmentIcon = (key: string) => SEGMENT[key] ?? "users";
export const templateIcon = (key: string) => TEMPLATE[key] ?? "sparkle";
export const suggestionIcon = (key: string) => SUGGESTION[key] ?? "sparkle";

/** Pastille d'icône de l'appli (fond gris clair, trait foncé). */
export function Tile({ name, size = "md" }: { name: KioskIconName; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-9 w-9 rounded-xl" : "h-12 w-12 rounded-2xl";
  return (
    <span className={`flex ${box} shrink-0 items-center justify-center bg-slate-100 text-slate-900`}>
      <KIcon name={name} className={size === "sm" ? "h-5 w-5" : "h-6 w-6"} />
    </span>
  );
}
