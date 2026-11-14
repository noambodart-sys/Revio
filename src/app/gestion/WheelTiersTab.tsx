"use client";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Flash, Reward, Settings, Tier, WheelPrize } from "./types";

export function WheelTiersTab({ settings, flash, onSaved }: { settings: Settings; flash: Flash; onSaved: () => void }) {
  const { features, rules } = settings;
  const [tiers, setTiers] = useState<Tier[]>(settings.tiers.map(({ name, minPoints, bonusPercent }) => ({ name, minPoints, bonusPercent })));
  const [prizes, setPrizes] = useState<WheelPrize[]>(
    settings.wheelPrizes.length >= 2
      ? settings.wheelPrizes.map(({ label, type, points, rewardId, weight }) => ({ label, type, points, rewardId, weight }))
      : [
          { label: "Perdu", type: "NOTHING", points: null, rewardId: null, weight: 60 },
          { label: "+10 points", type: "POINTS", points: 10, rewardId: null, weight: 40 },
        ],
  );
  const [rewards, setRewards] = useState<Reward[]>([]);
  useEffect(() => { api<Reward[]>("/api/v1/settings/rewards").then((r) => setRewards(r.filter((x) => x.active))).catch(() => undefined); }, []);

  const toggle = async (key: "tiersEnabled" | "wheelEnabled", value: boolean) => {
    try {
      await api("/api/v1/settings/rules", { method: "PATCH", body: { [key]: value } });
      flash(true, value ? "Activé" : "Désactivé");
      onSaved();
    } catch (e) {
      flash(false, errorMessage(e));
    }
  };

  const saveTiers = async () => {
    try {
      await api("/api/v1/settings/tiers", { method: "PUT", body: { tiers } });
      flash(true, "Niveaux enregistrés");
      onSaved();
    } catch (e) {
      flash(false, errorMessage(e));
    }
  };

  const savePrizes = async () => {
    try {
      await api("/api/v1/settings/wheel", {
        method: "PUT",
        body: { prizes: prizes.map((p) => ({ ...p, points: p.type === "POINTS" ? p.points : null, rewardId: p.type === "REWARD" ? p.rewardId : null })) },
      });
      flash(true, "Roue enregistrée");
      onSaved();
    } catch (e) {
      flash(false, errorMessage(e));
    }
  };

  const totalWeight = prizes.reduce((s, p) => s + (p.weight || 0), 0);
  const locked = !features.tiers || !features.wheel;

  const Switch = ({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-8 w-14 rounded-full transition disabled:opacity-40 ${on ? "bg-emerald-600" : "bg-slate-300"}`}
    >
      <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${on ? "left-7" : "left-1"}`} />
    </button>
  );

  return (
    <div className="space-y-5">
      {locked && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-amber-900">
          La roue et les niveaux sont inclus dans l&apos;offre <strong>Pro</strong>. Vous pouvez les préparer ici, ils s&apos;activeront avec l&apos;offre Pro.
        </div>
      )}

      <section className="card space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Niveaux de fidélité</h2>
            <p className="text-slate-600">Selon les points gagnés sur les {rules.tierWindowMonths} derniers mois. Chaque niveau donne un bonus sur les points des achats.</p>
          </div>
          <Switch on={rules.tiersEnabled} onChange={(v) => toggle("tiersEnabled", v)} disabled={!features.tiers} />
        </div>
        <table className="w-full">
          <thead className="text-left text-sm text-slate-500">
            <tr><th className="pb-2">Nom</th><th className="pb-2">À partir de (points)</th><th className="pb-2">Bonus (%)</th><th /></tr>
          </thead>
          <tbody>
            {tiers.map((t, i) => (
              <tr key={i}>
                <td className="py-1 pr-2"><input className="input" value={t.name} maxLength={40} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></td>
                <td className="py-1 pr-2">
                  <input className="input" inputMode="numeric" disabled={i === 0} value={t.minPoints} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, minPoints: Number(e.target.value.replace(/\D/g, "")) } : x)))} />
                </td>
                <td className="py-1 pr-2"><input className="input" inputMode="numeric" value={t.bonusPercent} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, bonusPercent: Number(e.target.value.replace(/\D/g, "")) } : x)))} /></td>
                <td className="py-1">{i > 0 && <button type="button" className="btn-ghost px-3 py-2" aria-label="Supprimer" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>✕</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-2">
          {tiers.length < 6 && <button type="button" className="btn-ghost" onClick={() => setTiers([...tiers, { name: "", minPoints: (tiers.at(-1)?.minPoints ?? 0) + 500, bonusPercent: 0 }])}>+ Ajouter un niveau</button>}
          <button type="button" className="btn-dark" onClick={saveTiers}>Enregistrer les niveaux</button>
        </div>
      </section>

      <section className="card space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Roue</h2>
            <p className="text-slate-600">Proposée après un achat, une fois par jour et par client. Le tirage est fait par le serveur.</p>
          </div>
          <Switch on={rules.wheelEnabled} onChange={(v) => toggle("wheelEnabled", v)} disabled={!features.wheel} />
        </div>
        <table className="w-full">
          <thead className="text-left text-sm text-slate-500">
            <tr><th className="pb-2">Texte affiché</th><th className="pb-2">Lot</th><th className="pb-2">Détail</th><th className="pb-2">Chances</th><th /></tr>
          </thead>
          <tbody>
            {prizes.map((p, i) => {
              const upd = (patch: Partial<WheelPrize>) => setPrizes(prizes.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <tr key={i} className="align-top">
                  <td className="py-1 pr-2"><input className="input" value={p.label} maxLength={40} onChange={(e) => upd({ label: e.target.value })} /></td>
                  <td className="py-1 pr-2">
                    <select className="input" value={p.type} onChange={(e) => upd({ type: e.target.value as WheelPrize["type"] })}>
                      <option value="NOTHING">Rien</option>
                      <option value="POINTS">Des points</option>
                      <option value="REWARD">Une récompense</option>
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    {p.type === "POINTS" && <input className="input" inputMode="numeric" placeholder="points" value={p.points ?? ""} onChange={(e) => upd({ points: Number(e.target.value.replace(/\D/g, "")) || null })} />}
                    {p.type === "REWARD" && (
                      <select className="input" value={p.rewardId ?? ""} onChange={(e) => upd({ rewardId: e.target.value || null })}>
                        <option value="">— choisir —</option>
                        {rewards.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="py-1 pr-2">
                    <div className="flex items-center gap-2">
                      <input className="input w-24" inputMode="numeric" value={p.weight} onChange={(e) => upd({ weight: Number(e.target.value.replace(/\D/g, "")) })} />
                      <span className="w-14 text-right text-sm tabular-nums text-slate-500">{totalWeight ? Math.round((p.weight / totalWeight) * 100) : 0} %</span>
                    </div>
                  </td>
                  <td className="py-1">{prizes.length > 2 && <button type="button" className="btn-ghost px-3 py-2" aria-label="Supprimer" onClick={() => setPrizes(prizes.filter((_, j) => j !== i))}>✕</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-sm text-slate-500">« Chances » : poids relatif de chaque case (le pourcentage est calculé automatiquement).</p>
        <div className="flex gap-2">
          {prizes.length < 12 && <button type="button" className="btn-ghost" onClick={() => setPrizes([...prizes, { label: "", type: "NOTHING", points: null, rewardId: null, weight: 10 }])}>+ Ajouter une case</button>}
          <button type="button" className="btn-dark" onClick={savePrizes}>Enregistrer la roue</button>
        </div>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          ⚖️ En Belgique, les jeux avec tirage au sort sont encadrés. La roue doit rester gratuite et ne jamais exiger d&apos;achat supplémentaire. Point en cours de vérification avec un juriste.
        </p>
      </section>
    </div>
  );
}
