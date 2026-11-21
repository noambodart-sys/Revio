"use client";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { BigButton, Card, Icon, Screen, Skeleton, relativeDay, euros } from "./ui";
import type { SendPreset } from "./SendFlow";
import { segmentIcon, Tile } from "./icons";

interface Segment { key: string; icon: string; label: string; description: string; count: number; reachable: number }
interface Member { id: string; firstName: string | null; maskedPhone: string | null; lastVisitAt: string | null; visits: number; balance: number; marketingSms: boolean }
interface Fiche {
  firstName: string | null;
  maskedPhone: string | null;
  balance: number;
  tier: { name: string } | null;
  enrolledAt: string;
  lastVisitAt: string | null;
  engagement: { visits: number; streakWeeks: number };
  consents: Record<string, boolean>;
  offers: { id: string; title: string }[];
  history: { id: string; type: string; points: number; purchaseAmountCents: number | null; occurredAt: string }[];
}

const TYPE: Record<string, string> = {
  EARN: "Achat", TIER_BONUS: "Bonus niveau", WHEEL_BONUS: "Roue", REDEEM: "Récompense", ADJUSTMENT: "Correction", EXPIRATION: "Expiration", REVERSAL: "Annulation",
  HAPPY_HOUR_BONUS: "Heures creuses", VISIT_MILESTONE_BONUS: "Visite fêtée", STREAK_BONUS: "Régularité", ANNIVERSARY_BONUS: "Anniversaire",
};

export function ClientsTab({ onSend }: { onSend: (p: SendPreset) => void }) {
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [open, setOpen] = useState<Segment | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [q, setQ] = useState("");
  const [fiche, setFiche] = useState<{ id: string; data: Fiche | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Segment[]>("/api/v1/app/segments").then(setSegments).catch((e) => setError(errorMessage(e)));
  }, []);

  useEffect(() => {
    if (!open) return;
    setMembers(null);
    setQ("");
    api<Member[]>(`/api/v1/app/segments/${open.key}`).then(setMembers).catch((e) => setError(errorMessage(e)));
  }, [open]);

  useEffect(() => {
    if (fiche && !fiche.data) api<Fiche>(`/api/v1/pos/customers/${fiche.id}`).then((data) => setFiche({ id: fiche.id, data })).catch((e) => setError(errorMessage(e)));
  }, [fiche]);

  // Fiche d'un client
  if (fiche) {
    const f = fiche.data;
    return (
      <Screen title={f ? f.firstName ?? "Client" : "…"} subtitle={f?.maskedPhone ?? undefined} onBack={() => setFiche(null)}>
        {!f ? <Skeleton /> : (
          <>
            <Card>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-5xl font-bold tabular-nums">{f.balance}</div>
                  <div className="text-slate-500">points{f.tier ? ` · ${f.tier.name}` : ""}</div>
                </div>
                <div className="text-right text-sm text-slate-500">
                  <div><strong className="text-slate-900">{f.engagement.visits}</strong> passages</div>
                  <div>dernière visite {relativeDay(f.lastVisitAt)}</div>
                  <div>client depuis {new Date(f.enrolledAt).toLocaleDateString("fr-BE", { month: "long", year: "numeric" })}</div>
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between">
                <span>Offres par SMS</span>
                <span className={`rounded-full px-3 py-1 text-sm font-semibold ${f.consents.MARKETING_SMS ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {f.consents.MARKETING_SMS ? "Accepte" : "Refusé"}
                </span>
              </div>
              {f.offers.length > 0 && <div className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-amber-900">Offre en cours : {f.offers.map((o) => o.title).join(", ")}</div>}
            </Card>
            <h2 className="px-1 pt-2 text-lg font-bold">Historique</h2>
            <Card className="divide-y divide-slate-100 py-1">
              {f.history.length === 0 && <p className="py-3 text-slate-500">Aucun passage pour l&apos;instant.</p>}
              {f.history.slice(0, 15).map((h) => (
                <div key={h.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="font-medium">{TYPE[h.type] ?? h.type}{h.purchaseAmountCents != null ? ` · ${euros(h.purchaseAmountCents)}` : ""}</div>
                    <div className="text-sm text-slate-500">{relativeDay(h.occurredAt)}</div>
                  </div>
                  <div className={`font-semibold tabular-nums ${h.points < 0 ? "text-red-600" : "text-emerald-700"}`}>{h.points > 0 ? "+" : ""}{h.points}</div>
                </div>
              ))}
            </Card>
            <p className="px-2 text-center text-sm text-slate-400">Le numéro complet n&apos;est jamais affiché : les SMS partent depuis l&apos;application.</p>
          </>
        )}
      </Screen>
    );
  }

  // Clients d'un groupe
  if (open) {
    const list = (members ?? []).filter((m) => !q || (m.firstName ?? "").toLowerCase().includes(q.toLowerCase()));
    return (
      <Screen
        title={open.label}
        subtitle={`${open.count} client${open.count > 1 ? "s" : ""} · ${open.reachable} joignable${open.reachable > 1 ? "s" : ""} par SMS`}
        onBack={() => setOpen(null)}
        aboveNav
        footer={open.reachable > 0 ? <BigButton onClick={() => onSend({ segmentKey: open.key })}><Icon.send className="h-5 w-5" /> Envoyer une offre à ce groupe</BigButton> : undefined}
      >
        <input className="h-14 w-full rounded-2xl bg-white px-5 text-lg outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-slate-900" placeholder="Rechercher un prénom" value={q} onChange={(e) => setQ(e.target.value)} />
        {!members ? <Skeleton /> : list.length === 0 ? (
          <Card className="text-center text-slate-500">Personne dans ce groupe pour l&apos;instant.</Card>
        ) : (
          <Card className="divide-y divide-slate-100 py-1">
            {list.map((m) => (
              <button key={m.id} onClick={() => setFiche({ id: m.id, data: null })} className="flex w-full items-center gap-4 py-3 text-left">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg font-semibold">{(m.firstName ?? "?").slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{m.firstName ?? "Sans prénom"} {m.marketingSms && <span className="ml-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">SMS</span>}</div>
                  <div className="text-sm text-slate-500">{m.visits} passage{m.visits > 1 ? "s" : ""} · {relativeDay(m.lastVisitAt)}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold tabular-nums">{m.balance}</div>
                  <div className="text-xs text-slate-400">points</div>
                </div>
              </button>
            ))}
          </Card>
        )}
      </Screen>
    );
  }

  // Liste des groupes
  return (
    <Screen title="Mes clients" subtitle="Vos clients, rangés pour vous">
      {error && <Card className="text-red-700">{error}</Card>}
      {!segments ? <Skeleton lines={5} /> : segments.map((s) => (
        <Card key={s.key} onClick={() => setOpen(s)}>
          <div className="flex items-center gap-4">
            <Tile name={segmentIcon(s.key)} />
            <div className="min-w-0 flex-1">
              <div className="text-lg font-semibold">{s.label}</div>
              <div className="truncate text-sm text-slate-500">{s.description}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold tabular-nums">{s.count}</div>
              <div className="text-xs text-slate-400">{s.reachable} par SMS</div>
            </div>
          </div>
        </Card>
      ))}
      <p className="px-2 pt-2 text-center text-sm text-slate-400">« par SMS » : clients qui acceptent de recevoir vos offres</p>
    </Screen>
  );
}
