"use client";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { BigButton, Card, Icon, Screen, Skeleton, euros } from "./ui";
import { templateIcon, Tile } from "./icons";

interface Result {
  id: string;
  title: string;
  templateKey: string | null;
  message: string;
  offerTitle: string | null;
  segment: string;
  sentAt: string;
  sent: number;
  failed: number;
  visitors: number;
  revenueCents: number;
  redeemed: number;
}

const VAR_LABEL: Record<string, string> = { prenom: "prénom", commerce: "commerce", points: "points", points_manquants: "points manquants", recompense: "récompense" };

export function ResultsTab({ onSend }: { onSend: () => void }) {
  const [items, setItems] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Result[]>("/api/v1/app/campaigns").then(setItems).catch((e) => setError(errorMessage(e)));
  }, []);

  const totals = (items ?? []).reduce((a, r) => ({ visitors: a.visitors + r.visitors, revenue: a.revenue + r.revenueCents }), { visitors: 0, revenue: 0 });

  return (
    <Screen title="Résultats" subtitle="Ce que vos messages ont rapporté">
      {error && <Card className="text-red-700">{error}</Card>}
      {!items ? <Skeleton /> : items.length === 0 ? (
        <>
          <Card className="py-10 text-center">
            <div className="flex justify-center"><Tile name="sparkle" /></div>
            <p className="mt-4 text-lg font-semibold">Pas encore de message envoyé</p>
            <p className="mt-1 text-slate-500">Envoyez une première offre : vous verrez ici combien de clients sont venus grâce à elle.</p>
          </Card>
          <BigButton onClick={onSend}><Icon.send className="h-5 w-5" /> Envoyer une offre</BigButton>
        </>
      ) : (
        <>
          <Card tone="dark">
            <div className="text-sm text-slate-300">Grâce à vos messages (7 jours après chaque envoi)</div>
            <div className="mt-2 flex items-end gap-6">
              <div><div className="text-5xl font-bold tabular-nums">{totals.visitors}</div><div className="text-slate-300">clients venus</div></div>
              <div><div className="text-3xl font-bold tabular-nums text-emerald-300">{euros(totals.revenue)}</div><div className="text-slate-300">d&apos;achats</div></div>
            </div>
          </Card>
          {items.map((r) => {
            const rate = r.sent ? Math.round((r.visitors / r.sent) * 100) : 0;
            return (
              <Card key={r.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <Tile name={templateIcon(r.templateKey ?? "")} size="sm" />
                    <div>
                    <div className="text-lg font-semibold">{r.title}</div>
                    <div className="text-sm text-slate-500">{new Date(r.sentAt).toLocaleDateString("fr-BE", { day: "numeric", month: "long" })} · {r.segment}</div>
                    </div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold">{r.sent} SMS</span>
                </div>
                <p className="mt-3 line-clamp-2 text-slate-600">{r.message.replace(/\{(\w+)\}/g, (_, k: string) => `[${VAR_LABEL[k] ?? k}]`)}</p>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center">
                  <div><div className="text-2xl font-bold tabular-nums">{r.visitors}</div><div className="text-xs text-slate-500">venus ({rate} %)</div></div>
                  <div><div className="text-2xl font-bold tabular-nums">{euros(r.revenueCents)}</div><div className="text-xs text-slate-500">d&apos;achats</div></div>
                  <div><div className="text-2xl font-bold tabular-nums">{r.offerTitle ? r.redeemed : "—"}</div><div className="text-xs text-slate-500">offres utilisées</div></div>
                </div>
              </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}
