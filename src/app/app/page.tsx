"use client";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/use-session";
import { Icon } from "./ui";
import { TodayTab } from "./TodayTab";
import { ClientsTab } from "./ClientsTab";
import { ResultsTab } from "./ResultsTab";
import { SendFlow, type SendPreset } from "./SendFlow";

type Tab = "today" | "clients" | "results";

/** L'appli du commerçant : quatre gestes, pas de jargon. */
export default function MerchantApp() {
  const me = useSession(["OWNER"], "/app");
  const [tab, setTab] = useState<Tab>("today");
  const [sending, setSending] = useState<SendPreset | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("onglet");
    if (t === "clients" || t === "results") setTab(t);
  }, []);

  if (!me) return <div className="flex min-h-screen items-center justify-center text-slate-400">Chargement…</div>;

  if (sending) {
    return (
      <SendFlow
        preset={sending}
        onClose={(sent) => {
          setSending(null);
          if (sent) setTab("results");
        }}
      />
    );
  }

  const nav: { id: Tab | "send"; label: string; icon: keyof typeof Icon }[] = [
    { id: "today", label: "Aujourd'hui", icon: "home" },
    { id: "clients", label: "Clients", icon: "users" },
    { id: "send", label: "Offre", icon: "send" },
    { id: "results", label: "Résultats", icon: "chart" },
  ];

  return (
    <>
      {tab === "today" && <TodayTab onSend={setSending} />}
      {tab === "clients" && <ClientsTab onSend={setSending} />}
      {tab === "results" && <ResultsTab onSend={() => setSending({})} />}

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-black/5 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {nav.map((n) => {
            const I = Icon[n.icon];
            const active = n.id === tab;
            if (n.id === "send") {
              return (
                <button key={n.id} onClick={() => setSending({})} className="flex flex-col items-center gap-1 py-2">
                  <span className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg"><I className="h-6 w-6" /></span>
                  <span className="text-xs font-semibold">{n.label}</span>
                </button>
              );
            }
            return (
              <button key={n.id} onClick={() => setTab(n.id as Tab)} className={`flex flex-col items-center gap-1 py-3 ${active ? "text-slate-900" : "text-slate-400"}`}>
                <I className="h-6 w-6" />
                <span className="text-xs font-semibold">{n.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
