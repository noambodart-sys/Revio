"use client";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, formatEuros } from "@/lib/api";
import type { Flash } from "./types";
import type { AutomationItem } from "../app/Autopilot";

/** Pilote automatique, version ordinateur : chaque message s'active et se modifie sur place. */
export function AutomationsTab({ flash, googleReviewUrl, onSaved }: { flash: Flash; googleReviewUrl: string | null; onSaved: () => void }) {
  const [items, setItems] = useState<AutomationItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { message: string; params: Record<string, string | number | null> }>>({});
  const [reviewUrl, setReviewUrl] = useState(googleReviewUrl ?? "");

  const load = useCallback(
    () =>
      api<AutomationItem[]>("/api/v1/automations")
        .then((l) => {
          setItems(l);
          setDrafts(Object.fromEntries(l.map((a) => [a.kind, { message: a.message, params: a.params }])));
        })
        .catch((e) => flash(false, errorMessage(e))),
    [flash],
  );
  useEffect(() => { load(); }, [load]);

  const save = async (a: AutomationItem, enabled: boolean) => {
    const d = drafts[a.kind];
    try {
      await api(`/api/v1/automations/${a.kind}`, {
        method: "PATCH",
        body: {
          enabled,
          message: d.message,
          params: Object.fromEntries(a.settings.map((s) => [s.key, s.type === "offer" ? ((d.params[s.key] as string) || null) : Number(d.params[s.key])])),
        },
      });
      flash(true, `${a.label} : ${enabled ? "activé" : "désactivé"} et enregistré`);
      load();
    } catch (e) {
      flash(false, errorMessage(e));
    }
  };

  const saveReviewUrl = async () => {
    try {
      await api("/api/v1/settings/branding", { method: "PATCH", body: { googleReviewUrl: reviewUrl || null } });
      flash(true, "Lien d'avis Google enregistré");
      onSaved();
      load();
    } catch (e) {
      flash(false, errorMessage(e));
    }
  };

  return (
    <div className="space-y-5">
      <div className="card">
        <h2 className="text-xl font-semibold">Messages automatiques</h2>
        <p className="text-slate-600">
          Envoyés tout seuls au bon moment, seulement aux clients qui ont accepté les offres, entre 9 h et 20 h (pas le dimanche),
          jamais deux fois pour la même occasion. Chaque message affiche ce qu&apos;il a rapporté sur 30 jours.
        </p>
      </div>
      {items.map((a) => {
        const d = drafts[a.kind];
        if (!d) return null;
        return (
          <div key={a.kind} className={`card space-y-3 ${a.enabled ? "ring-2 ring-emerald-500" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{a.label} {a.enabled && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-sm text-emerald-700">actif</span>}</h3>
                <p className="text-sm text-slate-500">{a.when}</p>
              </div>
              <div className="text-right text-sm text-slate-600">
                30 jours : <strong>{a.last30.sent}</strong> envoyés · <strong>{a.last30.visitors}</strong> revenus · <strong>{formatEuros(a.last30.revenueCents)}</strong>
              </div>
            </div>
            {a.kind === "REVIEW_REQUEST" && (
              <div className="flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3">
                <div className="min-w-[280px] flex-1">
                  <label className="label" htmlFor="g-review">Lien de votre fiche Google (« Demander des avis »)</label>
                  <input id="g-review" className="input" placeholder="https://g.page/r/…/review" value={reviewUrl} onChange={(e) => setReviewUrl(e.target.value)} />
                </div>
                <button className="btn-ghost" onClick={saveReviewUrl}>Enregistrer le lien</button>
                <p className="w-full text-sm text-slate-500">Aucune récompense n&apos;est donnée en échange d&apos;un avis : Google l&apos;interdit. Le lien s&apos;affiche aussi en QR code sur la tablette après un achat.</p>
              </div>
            )}
            <textarea className="input min-h-[90px]" maxLength={300} aria-label={`Message ${a.label}`} value={d.message} onChange={(e) => setDrafts({ ...drafts, [a.kind]: { ...d, message: e.target.value } })} />
            {a.settings.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {a.settings.map((s) => (
                  <div key={s.key}>
                    <label className="label" htmlFor={`${a.kind}-${s.key}`}>{s.label}</label>
                    <input
                      id={`${a.kind}-${s.key}`}
                      className="input"
                      inputMode={s.type === "offer" ? "text" : "numeric"}
                      placeholder={s.type === "offer" ? "ex. un café offert" : ""}
                      value={(d.params[s.key] ?? "") as string | number}
                      onChange={(e) => setDrafts({ ...drafts, [a.kind]: { ...d, params: { ...d.params, [s.key]: s.type === "offer" ? e.target.value : e.target.value.replace(/\D/g, "") } } })}
                    />
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-500">Variables : {"{prenom} {commerce} {points} {recompense}"}{a.canOffer ? " {offre}" : ""}{a.kind === "POINTS_EXPIRING" ? " {date_expiration}" : ""}{a.kind === "REVIEW_REQUEST" ? " {lien_avis}" : ""}</p>
            <div className="flex flex-wrap gap-2">
              <button className={a.enabled ? "btn-ghost" : "btn-dark"} onClick={() => save(a, !a.enabled)}>{a.enabled ? "Désactiver" : "Activer"}</button>
              <button className="btn-ghost" onClick={() => save(a, a.enabled)}>Enregistrer le texte</button>
              {d.message !== a.defaultMessage && <button className="text-sm text-slate-500 underline" onClick={() => setDrafts({ ...drafts, [a.kind]: { ...d, message: a.defaultMessage } })}>Texte conseillé</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
