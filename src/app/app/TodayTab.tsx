"use client";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { signOut } from "@/lib/use-session";
import { BigButton, Card, Icon, Screen, Skeleton, euros } from "./ui";
import type { SendPreset } from "./SendFlow";

interface Today {
  merchantName: string;
  firstName: string;
  stats: { visits: number; visitsLastWeek: number; revenueCents: number; points: number; newCustomers: number };
  happyHour: { active: { multiplierPercent: number; endMinute: number } | null };
  suggestions: { key: string; icon: string; title: string; text: string; templateKey: string; segmentKey: string; recipients: number }[];
}

export function TodayTab({ onSend }: { onSend: (p: SendPreset) => void }) {
  const [d, setD] = useState<Today | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Today>("/api/v1/app/today").then(setD).catch((e) => setError(errorMessage(e)));
  }, []);

  const hello = new Date().getHours() < 18 ? "Bonjour" : "Bonsoir";
  const s = d?.stats;
  const delta = s ? s.visits - s.visitsLastWeek : 0;

  return (
    <Screen title={d ? `${hello} ${d.firstName} 👋` : "Aujourd'hui"} subtitle={d?.merchantName}>
      {error && <Card className="text-red-700">{error}</Card>}
      {!d && !error && <Skeleton />}
      {d && s && (
        <>
          <Card>
            <div className="text-sm font-medium text-slate-500">Passages aujourd&apos;hui</div>
            <div className="mt-1 flex items-end gap-3">
              <span className="text-6xl font-bold tabular-nums tracking-tight">{s.visits}</span>
              {s.visitsLastWeek > 0 || s.visits > 0 ? (
                <span className={`mb-2 rounded-full px-2.5 py-1 text-sm font-semibold ${delta >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} vs la semaine passée
                </span>
              ) : null}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
              <div>
                <div className="text-2xl font-bold tabular-nums">{euros(s.revenueCents)}</div>
                <div className="text-sm text-slate-500">d&apos;achats encodés</div>
              </div>
              <div>
                <div className="text-2xl font-bold tabular-nums">{s.newCustomers}</div>
                <div className="text-sm text-slate-500">nouveau{s.newCustomers > 1 ? "x" : ""} client{s.newCustomers > 1 ? "s" : ""}</div>
              </div>
            </div>
          </Card>

          {d.happyHour.active && (
            <Card tone="amber">
              <div className="text-lg font-bold">⚡ Heures creuses en cours</div>
              <div className="text-slate-800">Les points sont multipliés jusqu&apos;à {Math.floor(d.happyHour.active.endMinute / 60)} h.</div>
            </Card>
          )}

          <h2 className="px-1 pt-3 text-lg font-bold">Nos idées pour vous</h2>
          {d.suggestions.map((sg) => (
            <Card key={sg.key} onClick={() => onSend({ templateKey: sg.templateKey, segmentKey: sg.segmentKey })}>
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-2xl">{sg.icon}</span>
                <div className="flex-1">
                  <div className="text-lg font-semibold leading-snug">{sg.title}</div>
                  <div className="mt-1 text-slate-500">{sg.text}</div>
                  <div className="mt-3 inline-flex items-center gap-1 font-semibold text-slate-900">Préparer le message <Icon.chevron className="h-4 w-4" /></div>
                </div>
              </div>
            </Card>
          ))}

          <div className="pt-3">
            <BigButton onClick={() => onSend({})}><Icon.send className="h-5 w-5" /> Envoyer une offre</BigButton>
          </div>
          <div className="flex justify-center gap-6 pt-6 text-sm text-slate-400">
            <a href="/gestion" className="underline">Réglages complets</a>
            <a href="/caisse" className="underline">Caisse</a>
            <button onClick={signOut} className="underline">Déconnexion</button>
          </div>
        </>
      )}
    </Screen>
  );
}
