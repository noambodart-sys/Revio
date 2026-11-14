"use client";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Flash, Reward } from "./types";

const empty = { name: "", description: "", pointsCost: "", stock: "" };

export function RewardsTab({ flash }: { flash: Flash }) {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(() => api<Reward[]>("/api/v1/settings/rewards").then(setRewards).catch((e) => flash(false, errorMessage(e))), [flash]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const body = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      pointsCost: Number(form.pointsCost),
      stock: form.stock === "" ? null : Number(form.stock),
    };
    try {
      if (editing) await api(`/api/v1/settings/rewards/${editing}`, { method: "PATCH", body });
      else await api("/api/v1/settings/rewards", { body });
      flash(true, editing ? "Récompense modifiée" : "Récompense ajoutée");
      setForm(empty);
      setEditing(null);
      load();
    } catch (e) {
      flash(false, errorMessage(e));
    }
  };

  const toggle = async (r: Reward) => {
    try {
      await api(`/api/v1/settings/rewards/${r.id}`, { method: "PATCH", body: { active: !r.active } });
      load();
    } catch (e) {
      flash(false, errorMessage(e));
    }
  };

  const valid = form.name.trim() && Number(form.pointsCost) > 0 && Number.isInteger(Number(form.pointsCost)) && (form.stock === "" || Number.isInteger(Number(form.stock)));

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="card">
        <h2 className="mb-3 text-xl font-semibold">Catalogue de récompenses</h2>
        <ul className="divide-y divide-slate-100">
          {rewards.map((r) => (
            <li key={r.id} className={`flex flex-wrap items-center justify-between gap-3 py-3 ${r.active ? "" : "opacity-50"}`}>
              <div>
                <div className="font-medium">{r.name} {!r.active && <span className="text-sm">(masquée)</span>}</div>
                <div className="text-sm text-slate-500">
                  {r.pointsCost} points{r.stock !== null ? ` · stock ${r.stock}` : " · stock illimité"}{r.description ? ` · ${r.description}` : ""}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost px-3 py-2 text-sm" onClick={() => { setEditing(r.id); setForm({ name: r.name, description: r.description ?? "", pointsCost: String(r.pointsCost), stock: r.stock === null ? "" : String(r.stock) }); }}>Modifier</button>
                <button className="btn-ghost px-3 py-2 text-sm" onClick={() => toggle(r)}>{r.active ? "Masquer" : "Réactiver"}</button>
              </div>
            </li>
          ))}
          {rewards.length === 0 && <li className="py-3 text-slate-500">Aucune récompense. Ajoutez-en une à droite.</li>}
        </ul>
      </div>

      <form className="card space-y-3 self-start" onSubmit={(e) => { e.preventDefault(); if (valid) save(); }}>
        <h3 className="text-lg font-semibold">{editing ? "Modifier la récompense" : "Nouvelle récompense"}</h3>
        <div>
          <label className="label">Nom</label>
          <input className="input" value={form.name} maxLength={80} placeholder="ex. Café offert" onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Coût en points</label>
          <input className="input" inputMode="numeric" value={form.pointsCost} placeholder="ex. 100" onChange={(e) => setForm({ ...form, pointsCost: e.target.value.replace(/\D/g, "") })} />
        </div>
        <div>
          <label className="label">Stock (vide = illimité)</label>
          <input className="input" inputMode="numeric" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value.replace(/\D/g, "") })} />
        </div>
        <div>
          <label className="label">Précision (facultatif)</label>
          <input className="input" value={form.description} maxLength={300} placeholder="ex. Valable sur les cafés simples" onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="flex gap-2">
          <button className="btn-dark flex-1" disabled={!valid}>{editing ? "Enregistrer" : "Ajouter"}</button>
          {editing && <button type="button" className="btn-ghost" onClick={() => { setEditing(null); setForm(empty); }}>Annuler</button>}
        </div>
        <p className="text-sm text-slate-500">Une récompense masquée n&apos;est plus proposée, mais l&apos;historique est conservé.</p>
      </form>
    </div>
  );
}
