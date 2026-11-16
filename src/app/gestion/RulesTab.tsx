"use client";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Flash, Settings } from "./types";
import { HappyHours, LoyaltyBonuses } from "./LoyaltyBonuses";
import { TemplatePicker } from "./TemplatePicker";

/** "5,50" → 550 ; renvoie null si invalide. */
function eurosToCents(v: string): number | null {
  const m = v.trim().replace(",", ".").match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

export function RulesTab({ settings, flash, onSaved }: { settings: Settings; flash: Flash; onSaved: () => void }) {
  const r = settings.rules;
  const [f, setF] = useState({
    earnMode: r.earnMode,
    pointsPerEuro: String(r.pointsPerEuro).replace(".", ","),
    pointsPerVisit: String(r.pointsPerVisit),
    minPurchase: (r.minPurchaseCents / 100).toFixed(2).replace(".", ","),
    identificationMode: r.identificationMode,
    pinMaxAttempts: String(r.pinMaxAttempts),
    pointsExpiryMonths: String(r.pointsExpiryMonths),
    inactivityRetentionMonths: String(r.inactivityRetentionMonths),
    dailyPointsCap: r.dailyPointsCap === null ? "" : String(r.dailyPointsCap),
    adjustmentAlertDailyCount: String(r.adjustmentAlertDailyCount),
    kioskResetSeconds: String(r.kioskResetSeconds),
    smsMaxPerMonth: String(r.smsMaxPerMonth),
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    const ppe = Number(f.pointsPerEuro.replace(",", "."));
    const min = eurosToCents(f.minPurchase);
    if (!Number.isFinite(ppe) || min === null) return flash(false, "Vérifiez les montants (ex. 1 ou 1,5 ; 5,00)");
    setBusy(true);
    try {
      await api("/api/v1/settings/rules", {
        method: "PATCH",
        body: {
          earnMode: f.earnMode,
          pointsPerEuro: Math.round(ppe * 100) / 100,
          pointsPerVisit: Number(f.pointsPerVisit),
          minPurchaseCents: min,
          identificationMode: f.identificationMode,
          pinMaxAttempts: Number(f.pinMaxAttempts),
          pointsExpiryMonths: Number(f.pointsExpiryMonths),
          inactivityRetentionMonths: Number(f.inactivityRetentionMonths),
          dailyPointsCap: f.dailyPointsCap === "" ? null : Number(f.dailyPointsCap),
          adjustmentAlertDailyCount: Number(f.adjustmentAlertDailyCount),
          kioskResetSeconds: Number(f.kioskResetSeconds),
          smsMaxPerMonth: Number(f.smsMaxPerMonth),
        },
      });
      flash(true, "Règles enregistrées");
      onSaved();
    } catch (e) {
      flash(false, errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const num = (k: keyof typeof f, label: string, help?: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label" htmlFor={`rule-${k}`}>{label}</label>
      <input id={`rule-${k}`} className="input" inputMode="decimal" value={f[k]} onChange={set(k)} {...props} />
      {help && <p className="mt-1 text-sm text-slate-500">{help}</p>}
    </div>
  );

  return (
    <div className="space-y-5">
    <LoyaltyBonuses settings={settings} flash={flash} onSaved={onSaved} />
    <HappyHours settings={settings} flash={flash} onSaved={onSaved} />
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <section className="card space-y-4">
        <h2 className="text-xl font-semibold">Gain de points</h2>
        <div className="flex flex-wrap gap-3">
          {(["PER_EURO", "PER_VISIT"] as const).map((m) => (
            <label key={m} className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-3 ring-1 ${f.earnMode === m ? "bg-slate-900 text-white ring-slate-900" : "ring-slate-200"}`}>
              <input type="radio" className="sr-only" checked={f.earnMode === m} onChange={() => setF({ ...f, earnMode: m })} />
              {m === "PER_EURO" ? "Selon le montant dépensé" : "Montant fixe par passage"}
            </label>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {f.earnMode === "PER_EURO"
            ? num("pointsPerEuro", "Points par euro", "Arrondi à l'inférieur. Ex. 1 → un achat de 12,90 € donne 12 points.")
            : num("pointsPerVisit", "Points par passage", "Quel que soit le montant de l'achat.")}
          {num("minPurchase", "Achat minimum (€)", "En dessous, aucun point n'est donné. 0 = pas de minimum.")}
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-xl font-semibold">Identification du client</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="rule-identificationMode">Après avoir tapé son numéro, le client…</label>
            <select id="rule-identificationMode" className="input" value={f.identificationMode} onChange={set("identificationMode")}>
              <option value="PIN">tape son code secret à 4 chiffres</option>
              <option value="STAFF_VALIDATION">est confirmé par le vendeur à la caisse</option>
            </select>
          </div>
          {f.identificationMode === "PIN" && num("pinMaxAttempts", "Essais avant blocage du code", "Entre 3 et 10. Ensuite, le vendeur confirme l'identité.")}
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-xl font-semibold">Durées</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {num("pointsExpiryMonths", "Expiration des points (mois sans visite)", "Le solde est remis à zéro après cette période sans passage.")}
          {num("inactivityRetentionMonths", "Suppression des clients inactifs (mois)", "Obligation RGPD : les données d'un client inactif sont effacées automatiquement. Maximum 36.")}
          {num("kioskResetSeconds", "Retour à l'accueil de la tablette (secondes)", "Après l'affichage des points gagnés. Entre 5 et 120.")}
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-xl font-semibold">Protection contre la fraude</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {num("dailyPointsCap", "Maximum de points par client et par jour", "Vide = pas de plafond. Au-delà, les points ne sont pas crédités et une alerte est créée.")}
          {num("adjustmentAlertDailyCount", "Alerte après N corrections par vendeur et par jour", "Les corrections manuelles restent possibles, mais vous êtes alerté.")}
          {num("smsMaxPerMonth", "SMS d'offres maximum par client et par mois", "Entre 1 et 8. Au-delà, le client n'est plus contacté jusqu'au mois suivant.")}
        </div>
      </section>

      <div className="sticky bottom-4 flex justify-end">
        <button className="btn-dark px-8 py-4 text-lg shadow-lg" disabled={busy}>Enregistrer les règles</button>
      </div>
    </form>
    <section className="card space-y-3">
      <h2 className="text-xl font-semibold">Repartir d&apos;un modèle</h2>
      <p className="text-slate-600">Remplace vos règles, niveaux, récompenses, roue et heures creuses par les réglages conseillés pour un métier. Vos clients et leurs points ne changent pas.</p>
      <TemplatePicker templates={settings.templates} current={settings.merchant.businessType} flash={flash} onApplied={onSaved} confirmFirst />
    </section>
    </div>
  );
}
