"use client";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { BonusPeriod, Flash, Settings } from "./types";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fromTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** Bonus de régularité : Ne visite, semaines d'affilée, anniversaire d'inscription. */
export function LoyaltyBonuses({ settings, flash, onSaved }: { settings: Settings; flash: Flash; onSaved: () => void }) {
  const r = settings.rules;
  const [f, setF] = useState({
    milestoneOn: r.visitMilestoneEvery !== null,
    milestoneEvery: String(r.visitMilestoneEvery ?? 10),
    milestonePoints: String(r.visitMilestonePoints || 20),
    streakOn: r.streakWeeks !== null,
    streakWeeks: String(r.streakWeeks ?? 4),
    streakPoints: String(r.streakPoints || 30),
    annivOn: r.anniversaryPoints !== null,
    annivPoints: String(r.anniversaryPoints ?? 50),
  });
  const digits = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.replace(/\D/g, "") });

  const save = async () => {
    try {
      await api("/api/v1/settings/rules", {
        method: "PATCH",
        body: {
          visitMilestoneEvery: f.milestoneOn ? Number(f.milestoneEvery) : null,
          visitMilestonePoints: f.milestoneOn ? Number(f.milestonePoints) : 0,
          streakWeeks: f.streakOn ? Number(f.streakWeeks) : null,
          streakPoints: f.streakOn ? Number(f.streakPoints) : 0,
          anniversaryPoints: f.annivOn ? Number(f.annivPoints) : null,
        },
      });
      flash(true, "Bonus de fidélité enregistrés");
      onSaved();
    } catch (e) {
      flash(false, errorMessage(e));
    }
  };

  const Row = ({ on, onToggle, title, children }: { on: boolean; onToggle: (v: boolean) => void; title: string; children: React.ReactNode }) => (
    <div className={`rounded-xl p-4 ring-1 ${on ? "bg-white ring-slate-300" : "bg-slate-50 ring-slate-200"}`}>
      <label className="flex cursor-pointer items-center gap-3 text-lg font-medium">
        <input type="checkbox" className="h-6 w-6" checked={on} onChange={(e) => onToggle(e.target.checked)} />
        {title}
      </label>
      {on && <div className="mt-3 flex flex-wrap items-center gap-2 pl-9 text-slate-700">{children}</div>}
    </div>
  );
  const small = "input w-24 py-2 text-center";

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Bonus de fidélité</h2>
        <p className="text-slate-600">Récompensez la régularité, pas seulement le montant. Ces bonus s&apos;affichent en grand sur la tablette.</p>
      </div>
      <Row on={f.milestoneOn} onToggle={(v) => setF({ ...f, milestoneOn: v })} title="🎉 Fêter les visites">
        Toutes les <input aria-label="Nombre de visites" className={small} inputMode="numeric" value={f.milestoneEvery} onChange={digits("milestoneEvery")} /> visites,
        offrir <input aria-label="Points de la visite fêtée" className={small} inputMode="numeric" value={f.milestonePoints} onChange={digits("milestonePoints")} /> points
      </Row>
      <Row on={f.streakOn} onToggle={(v) => setF({ ...f, streakOn: v })} title="🔥 Récompenser la régularité">
        Après <input aria-label="Semaines d'affilée" className={small} inputMode="numeric" value={f.streakWeeks} onChange={digits("streakWeeks")} /> semaines d&apos;affilée avec au moins une visite,
        offrir <input aria-label="Points de régularité" className={small} inputMode="numeric" value={f.streakPoints} onChange={digits("streakPoints")} /> points
      </Row>
      <Row on={f.annivOn} onToggle={(v) => setF({ ...f, annivOn: v })} title="🎂 Anniversaire de fidélité">
        Chaque année d&apos;inscription, offrir <input aria-label="Points d'anniversaire" className={small} inputMode="numeric" value={f.annivPoints} onChange={digits("annivPoints")} /> points
        <span className="w-full text-sm text-slate-500">Sans demander la date de naissance : on fête la date d&apos;inscription.</span>
      </Row>
      <button type="button" className="btn-dark" onClick={save}>Enregistrer les bonus</button>
    </section>
  );
}

/** Heures creuses : créneaux où les points sont multipliés. */
export function HappyHours({ settings, flash, onSaved }: { settings: Settings; flash: Flash; onSaved: () => void }) {
  const [periods, setPeriods] = useState<BonusPeriod[]>(settings.bonusPeriods.map(({ dayOfWeek, startMinute, endMinute, multiplierPercent }) => ({ dayOfWeek, startMinute, endMinute, multiplierPercent })));
  const upd = (i: number, patch: Partial<BonusPeriod>) => setPeriods(periods.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const save = async () => {
    try {
      await api("/api/v1/settings/bonus-periods", { method: "PUT", body: { periods } });
      flash(true, "Heures creuses enregistrées");
      onSaved();
    } catch (e) {
      flash(false, errorMessage(e));
    }
  };

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-xl font-semibold">⚡ Heures creuses</h2>
        <p className="text-slate-600">Multipliez les points quand le magasin est calme pour attirer du monde à ces moments-là. La tablette et la caisse l&apos;annoncent.</p>
      </div>
      {periods.length === 0 && <p className="text-slate-500">Aucun créneau pour l&apos;instant.</p>}
      <div className="space-y-2">
        {periods.map((p, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3">
            <select aria-label="Jour" className="input w-40 py-2" value={p.dayOfWeek} onChange={(e) => upd(i, { dayOfWeek: Number(e.target.value) })}>
              {DAYS.map((d, k) => <option key={d} value={k + 1}>{d}</option>)}
            </select>
            de <input aria-label="Début" type="time" className="input w-32 py-2" value={toTime(p.startMinute)} onChange={(e) => upd(i, { startMinute: fromTime(e.target.value) })} />
            à <input aria-label="Fin" type="time" className="input w-32 py-2" value={toTime(p.endMinute === 1440 ? 1439 : p.endMinute)} onChange={(e) => upd(i, { endMinute: fromTime(e.target.value) })} />
            <select aria-label="Multiplicateur" className="input w-36 py-2" value={p.multiplierPercent} onChange={(e) => upd(i, { multiplierPercent: Number(e.target.value) })}>
              <option value={150}>points +50 %</option>
              <option value={200}>points ×2</option>
              <option value={300}>points ×3</option>
            </select>
            <button type="button" className="btn-ghost px-3 py-2" aria-label="Supprimer le créneau" onClick={() => setPeriods(periods.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" onClick={() => setPeriods([...periods, { dayOfWeek: 2, startMinute: 14 * 60, endMinute: 16 * 60, multiplierPercent: 200 }])}>+ Ajouter un créneau</button>
        <button type="button" className="btn-dark" onClick={save}>Enregistrer les heures creuses</button>
      </div>
    </section>
  );
}
