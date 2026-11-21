"use client";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, formatDate } from "@/lib/api";
import type { Flash } from "./types";

interface Member { id: string; displayName: string; role: "OWNER" | "STAFF"; email: string | null; hasLogin: boolean; hasPin: boolean; lastLoginAt: string | null; disabled: boolean }

export function TeamTab({ flash, meId }: { flash: Flash; meId: string }) {
  const [team, setTeam] = useState<Member[]>([]);
  const [form, setForm] = useState({ displayName: "", role: "STAFF" as "STAFF" | "OWNER", pin: "", withLogin: false, email: "", password: "" });
  const [pinFor, setPinFor] = useState<{ id: string; pin: string } | null>(null);
  const [pw, setPw] = useState({ current: "", next: "" });

  const load = useCallback(() => api<Member[]>("/api/v1/team").then(setTeam).catch((e) => flash(false, errorMessage(e))), [flash]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      flash(true, ok);
      load();
    } catch (e) {
      flash(false, errorMessage(e));
    }
  };

  const add = () =>
    act(async () => {
      await api("/api/v1/team", {
        body: { displayName: form.displayName, role: form.role, pin: form.pin || undefined, email: form.withLogin ? form.email : undefined, password: form.withLogin ? form.password : undefined },
      });
      setForm({ displayName: "", role: "STAFF", pin: "", withLogin: false, email: "", password: "" });
    }, "Membre ajouté");

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        <div className="card">
          <h2 className="text-xl font-semibold">Votre équipe</h2>
          <p className="mb-3 text-slate-600">
            Le <strong>code vendeur</strong> sert à encaisser directement sur la tablette (« Espace vendeur »), sans ordinateur.
            L&apos;<strong>e-mail</strong> donne accès à la caisse sur un ordinateur ou un téléphone.
          </p>
          <ul className="divide-y divide-slate-100">
            {team.map((m) => (
              <li key={m.id} className={`flex flex-wrap items-center justify-between gap-3 py-3 ${m.disabled ? "opacity-50" : ""}`}>
                <div>
                  <div className="font-semibold">{m.displayName} <span className="font-normal text-slate-500">· {m.role === "OWNER" ? "propriétaire" : "vendeur"}{m.id === meId ? " (vous)" : ""}{m.disabled ? " · désactivé" : ""}</span></div>
                  <div className="text-sm text-slate-500">
                    {m.hasPin ? "Code vendeur ✓" : "Pas de code vendeur"} · {m.email ?? "pas d'accès caisse"}{m.lastLoginAt ? ` · connecté le ${formatDate(m.lastLoginAt)}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {pinFor?.id === m.id ? (
                    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); act(async () => { await api(`/api/v1/team/${m.id}`, { method: "PATCH", body: { pin: pinFor.pin } }); setPinFor(null); }, "Code vendeur enregistré"); }}>
                      <input className="input w-32 py-2" inputMode="numeric" maxLength={6} placeholder="4 à 6 chiffres" aria-label="Nouveau code vendeur" value={pinFor.pin} onChange={(e) => setPinFor({ id: m.id, pin: e.target.value.replace(/\D/g, "") })} autoFocus />
                      <button className="btn-dark px-3 py-2 text-sm" disabled={pinFor.pin.length < 4}>OK</button>
                      <button type="button" className="btn-ghost px-3 py-2 text-sm" onClick={() => setPinFor(null)}>Annuler</button>
                    </form>
                  ) : (
                    !m.disabled && <button className="btn-ghost px-3 py-2 text-sm" onClick={() => setPinFor({ id: m.id, pin: "" })}>{m.hasPin ? "Changer le code" : "Donner un code"}</button>
                  )}
                  {m.id !== meId && (
                    <button
                      className="btn-ghost px-3 py-2 text-sm"
                      onClick={() => {
                        if (!m.disabled && !confirm(`Désactiver ${m.displayName} ? Son code et ses accès ne fonctionneront plus.`)) return;
                        act(() => api(`/api/v1/team/${m.id}`, { method: "PATCH", body: { disabled: !m.disabled } }).then(() => undefined), m.disabled ? "Membre réactivé" : "Membre désactivé");
                      }}
                    >
                      {m.disabled ? "Réactiver" : "Désactiver"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <form className="card max-w-xl space-y-3" onSubmit={(e) => { e.preventDefault(); act(() => api("/api/v1/auth/password", { body: pw }).then(() => setPw({ current: "", next: "" })), "Mot de passe changé"); }}>
          <h3 className="text-lg font-semibold">Mon mot de passe</h3>
          <input className="input" type="password" autoComplete="current-password" placeholder="Mot de passe actuel" aria-label="Mot de passe actuel" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          <input className="input" type="password" autoComplete="new-password" placeholder="Nouveau mot de passe (12 caractères minimum)" aria-label="Nouveau mot de passe" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          <button className="btn-dark" disabled={!pw.current || pw.next.length < 12}>Changer mon mot de passe</button>
        </form>
      </div>

      <form className="card space-y-3 self-start" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <h3 className="text-lg font-semibold">Ajouter quelqu&apos;un</h3>
        <div>
          <label className="label" htmlFor="m-name">Prénom</label>
          <input id="m-name" className="input" maxLength={40} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="m-role">Rôle</label>
          <select id="m-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "STAFF" | "OWNER" })}>
            <option value="STAFF">Vendeur</option>
            <option value="OWNER">Propriétaire (accès à tout)</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="m-pin">Code vendeur (4 à 6 chiffres)</label>
          <input id="m-pin" className="input" inputMode="numeric" maxLength={6} value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })} />
        </div>
        <label className="flex items-center gap-2 text-slate-700">
          <input type="checkbox" checked={form.withLogin} onChange={(e) => setForm({ ...form, withLogin: e.target.checked })} />
          Accès à la caisse sur ordinateur ou téléphone
        </label>
        {form.withLogin && (
          <>
            <input className="input" type="email" placeholder="E-mail" aria-label="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className="input" type="text" placeholder="Mot de passe provisoire (12 caractères min.)" aria-label="Mot de passe provisoire" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </>
        )}
        <button className="btn-dark w-full" disabled={!form.displayName.trim() || (!form.pin && !form.withLogin)}>Ajouter</button>
      </form>
    </div>
  );
}
