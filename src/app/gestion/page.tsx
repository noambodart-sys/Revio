"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, errorMessage } from "@/lib/api";
import { signOut, useSession } from "@/lib/use-session";
import { WrongAccount } from "@/components/WrongAccount";
import { PLAN_LABEL } from "@/config/plans";
import type { Settings } from "./types";
import { DashboardTab } from "./DashboardTab";
import { CustomersTab } from "./CustomersTab";
import { RewardsTab } from "./RewardsTab";
import { RulesTab } from "./RulesTab";
import { WheelTiersTab } from "./WheelTiersTab";
import { BrandingTab } from "./BrandingTab";
import { RequestsTab } from "./RequestsTab";
import { TeamTab } from "./TeamTab";
import { TemplatePicker } from "./TemplatePicker";

const TABS = [
  { id: "dashboard", label: "Tableau de bord" },
  { id: "customers", label: "Clients" },
  { id: "rewards", label: "Récompenses" },
  { id: "rules", label: "Règles des points" },
  { id: "wheel", label: "Roue et niveaux" },
  { id: "branding", label: "Apparence" },
  { id: "team", label: "Équipe" },
  { id: "requests", label: "Demandes RGPD" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function GestionPage() {
  const { me, wrongAccount } = useSession(["OWNER"], "/gestion");
  const [tab, setTab] = useState<TabId>("dashboard");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const flash = useCallback((ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 5000);
  }, []);

  const reload = useCallback(() => api<Settings>("/api/v1/settings/rules").then(setSettings).catch((e) => flash(false, errorMessage(e))), [flash]);

  useEffect(() => {
    if (!me) return;
    reload();
    try {
      const saved = localStorage.getItem("gestion_tab") as TabId | null;
      if (saved && TABS.some((t) => t.id === saved)) setTab(saved);
    } catch {}
  }, [me, reload]);

  const selectTab = (t: TabId) => {
    setTab(t);
    try { localStorage.setItem("gestion_tab", t); } catch {}
  };

  if (wrongAccount) return <WrongAccount user={wrongAccount} pageName="La gestion" needed="au propriétaire du commerce" next="/gestion" />;
  if (!me || !settings) return <main className="p-6 text-slate-500">Chargement…</main>;

  return (
    <main className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 px-5 py-3 text-white">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold">{settings.merchant.name}</span>
          <span className="rounded-full bg-white/15 px-3 py-0.5 text-sm">Offre {PLAN_LABEL[settings.merchant.plan]}</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/app" className="rounded-lg bg-white/15 px-3 py-1.5 font-semibold">📱 Appli téléphone</Link>
          <Link href="/caisse" className="rounded-lg bg-white px-3 py-1.5 font-semibold text-slate-900">Ouvrir la caisse</Link>
          <span>{me.displayName}</span>
          <button className="underline" onClick={() => signOut()}>Déconnexion</button>
        </div>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => selectTab(t.id)}
            className={`whitespace-nowrap border-b-2 px-4 py-3 font-medium ${tab === t.id ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {msg && (
        <div className={`fixed left-1/2 top-4 z-50 w-[90%] max-w-lg -translate-x-1/2 rounded-xl px-5 py-3 font-medium shadow-lg ${msg.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>{msg.text}</div>
      )}

      <div className="mx-auto max-w-6xl p-5">
        {!settings.merchant.businessType && settings.counts.customers === 0 && (
          <section className="card mb-5 space-y-3 ring-2 ring-slate-900">
            <h2 className="text-2xl font-bold">👋 Démarrage rapide</h2>
            <p className="text-slate-600">Choisissez votre métier : récompenses, règles, bonus de fidélité, heures creuses et couleurs sont préremplis. Vous pourrez tout modifier ensuite.</p>
            <TemplatePicker templates={settings.templates} current={null} flash={flash} onApplied={reload} />
          </section>
        )}
        {tab === "dashboard" && <DashboardTab enabled={settings.features.dashboard} />}
        {tab === "customers" && <CustomersTab flash={flash} />}
        {tab === "rewards" && <RewardsTab flash={flash} />}
        {tab === "rules" && <RulesTab settings={settings} flash={flash} onSaved={reload} />}
        {tab === "wheel" && <WheelTiersTab settings={settings} flash={flash} onSaved={reload} />}
        {tab === "branding" && <BrandingTab settings={settings} flash={flash} onSaved={reload} />}
        {tab === "requests" && <RequestsTab flash={flash} />}
        {tab === "team" && <TeamTab flash={flash} meId={me.id} />}
      </div>
    </main>
  );
}
