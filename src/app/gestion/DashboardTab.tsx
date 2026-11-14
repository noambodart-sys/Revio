"use client";
import { useEffect, useState } from "react";
import { api, errorMessage, formatDate, formatEuros } from "@/lib/api";

interface Dashboard {
  customers: { total: number; active30: number; new30: number };
  visits: { last7: number; last30: number };
  points: { earned30: number; redeemed30: number; outstanding: number };
  revenue30Cents: number;
  rewards30: number;
  topRewards: { name: string; count: number }[];
  visitsByDay: { day: string; visits: number }[];
  alerts: { id: string; action: string; at: string; by: string | null; metadata: Record<string, unknown> | null }[];
  impact: {
    returningCustomers: number;
    returningRevenueCents: number;
    regularCustomers: number;
    regularRevenueCents: number;
    regularShare: number;
    happyHourVisits: number;
    loyaltyBonuses: number;
    gapDays: number;
  };
  winBack: { id: string; firstName: string | null; maskedPhone: string | null; visits: number; lastVisitAt: string; usualEveryDays: number; daysSince: number; balance: number; marketingSms: boolean }[];
}

const ALERT_LABEL: Record<string, string> = {
  "fraud.adjustment_alert": "Nombre de corrections de points inhabituel",
  "fraud.daily_cap_reached": "Plafond quotidien de points atteint",
};

export function DashboardTab({ enabled }: { enabled: boolean }) {
  const [d, setD] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (enabled) api<Dashboard>("/api/v1/backoffice/dashboard").then(setD).catch((e) => setError(errorMessage(e)));
  }, [enabled]);

  if (!enabled) {
    return (
      <div className="card max-w-xl space-y-2">
        <h2 className="text-xl font-semibold">Tableau de bord</h2>
        <p className="text-slate-600">Les statistiques (clients actifs, passages, points, récompenses) sont incluses dans l&apos;offre <strong>Pro</strong>, avec la roue et les niveaux.</p>
        <p className="text-slate-600">Vous pouvez déjà gérer vos clients, vos récompenses et vos règles dans les autres onglets.</p>
      </div>
    );
  }
  if (error) return <div className="card text-red-700">{error}</div>;
  if (!d) return <div className="text-slate-500">Chargement…</div>;

  const tiles = [
    { label: "Clients inscrits", value: d.customers.total, sub: `${d.customers.new30} nouveau${d.customers.new30 > 1 ? "x" : ""} sur 30 jours` },
    { label: "Clients actifs", value: d.customers.active30, sub: "venus au moins une fois en 30 jours" },
    { label: "Passages", value: d.visits.last30, sub: `${d.visits.last7} ces 7 derniers jours` },
    { label: "Achats encodés", value: formatEuros(d.revenue30Cents), sub: "sur 30 jours" },
    { label: "Points distribués", value: d.points.earned30, sub: `${d.points.redeemed30} utilisés sur 30 jours` },
    { label: "Récompenses remises", value: d.rewards30, sub: `${d.points.outstanding} points en circulation` },
  ];

  const im = d.impact;
  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-slate-900 p-6 text-white shadow-lg">
        <h2 className="text-lg font-medium text-slate-300">Ce que votre programme de fidélité vous apporte · 30 derniers jours</h2>
        <div className="mt-4 grid gap-6 md:grid-cols-3">
          <div>
            <div className="text-5xl font-black tabular-nums">{im.returningCustomers}</div>
            <div className="mt-1 text-slate-300">client{im.returningCustomers > 1 ? "s" : ""} revenu{im.returningCustomers > 1 ? "s" : ""} après plus de {im.gapDays} jours d&apos;absence</div>
            <div className="mt-1 text-xl font-semibold text-emerald-300">{formatEuros(im.returningRevenueCents)} d&apos;achats depuis leur retour</div>
          </div>
          <div>
            <div className="text-5xl font-black tabular-nums">{im.regularShare} %</div>
            <div className="mt-1 text-slate-300">de vos achats encodés viennent de {im.regularCustomers} client{im.regularCustomers > 1 ? "s" : ""} régulier{im.regularCustomers > 1 ? "s" : ""} (2 passages ou plus)</div>
            <div className="mt-1 text-xl font-semibold text-emerald-300">{formatEuros(im.regularRevenueCents)}</div>
          </div>
          <div className="space-y-3">
            <div><span className="text-3xl font-black tabular-nums">{im.happyHourVisits}</span> <span className="text-slate-300">passages pendant vos heures creuses</span></div>
            <div><span className="text-3xl font-black tabular-nums">{im.loyaltyBonuses}</span> <span className="text-slate-300">bonus de fidélité offerts (visites, régularité, anniversaires)</span></div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="card">
            <div className="text-sm font-medium text-slate-500">{t.label}</div>
            <div className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{t.value}</div>
            <div className="mt-1 text-sm text-slate-500">{t.sub}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <VisitsChart data={d.visitsByDay} />
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold">Habitués à relancer</h3>
        <p className="mb-3 text-slate-600">Des clients réguliers qu&apos;on ne voit plus : absents depuis plus de deux fois leur rythme habituel.</p>
        {d.winBack.length === 0 ? (
          <p className="text-slate-500">Personne pour l&apos;instant. Vos habitués sont fidèles au poste. ✓</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-sm text-slate-500">
                <tr><th className="py-2 pr-3">Client</th><th className="pr-3">Venait</th><th className="pr-3">Absent depuis</th><th className="pr-3 text-right">Passages</th><th className="pr-3 text-right">Points</th><th>Accord SMS</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {d.winBack.map((c) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => (window.location.href = `/caisse?client=${c.id}`)}>
                    <td className="py-2 pr-3"><div className="font-medium">{c.firstName ?? "—"}</div><div className="text-sm text-slate-500">{c.maskedPhone}</div></td>
                    <td className="pr-3">{c.usualEveryDays <= 1 ? "tous les jours" : `tous les ${c.usualEveryDays} jours`}</td>
                    <td className="pr-3 font-semibold text-amber-700">{c.daysSince} jours</td>
                    <td className="pr-3 text-right tabular-nums">{c.visits}</td>
                    <td className="pr-3 text-right tabular-nums">{c.balance}</td>
                    <td>{c.marketingSms ? "oui" : "non"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-sm text-slate-500">Bientôt : un SMS « Vous nous manquez » en un clic, uniquement pour les clients qui ont accepté les offres.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-3 text-lg font-semibold">Récompenses les plus remises (30 jours)</h3>
          {d.topRewards.length === 0 ? (
            <p className="text-slate-500">Aucune récompense remise pour l&apos;instant.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {d.topRewards.map((r) => (
                <li key={r.name} className="flex justify-between py-2"><span>{r.name}</span><span className="font-semibold tabular-nums">{r.count}</span></li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <h3 className="mb-3 text-lg font-semibold">Alertes (30 jours)</h3>
          {d.alerts.length === 0 ? (
            <p className="text-slate-500">Aucune alerte. ✓</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {d.alerts.map((a) => (
                <li key={a.id} className="py-2">
                  <div className="font-medium"><span aria-hidden>⚠️</span> {ALERT_LABEL[a.action] ?? a.action}</div>
                  <div className="text-sm text-slate-500">{formatDate(a.at)}{a.by ? ` · ${a.by}` : ""}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** Barres verticales : passages par jour, une seule série, survol pour le détail, vue tableau. */
function VisitsChart({ data }: { data: { day: string; visits: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const W = 720, H = 220, padL = 32, padB = 26, padT = 10;
  const max = Math.max(4, ...data.map((d) => d.visits));
  const niceMax = Math.ceil(max / 4) * 4;
  const plotW = W - padL, plotH = H - padB - padT;
  const slot = plotW / data.length;
  const barW = Math.max(4, slot - 2); // 2px d'espace entre les barres
  const y = (v: number) => padT + plotH - (v / niceMax) * plotH;
  const label = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString("fr-BE", { day: "numeric", month: "short" });
  const ticks = [0, niceMax / 2, niceMax];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Passages par jour (30 derniers jours)</h3>
        <button className="text-sm text-slate-600 underline" onClick={() => setAsTable((v) => !v)}>{asTable ? "Voir le graphique" : "Voir le tableau"}</button>
      </div>
      {asTable ? (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500"><tr><th className="py-1">Jour</th><th className="text-right">Passages</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((d) => <tr key={d.day}><td className="py-1">{label(d.day)}</td><td className="text-right tabular-nums">{d.visits}</td></tr>)}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Passages par jour sur 30 jours" onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth="1" />
                <text x={padL - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="#64748b">{t}</text>
              </g>
            ))}
            {data.map((d, i) => {
              const x = padL + i * slot + 1;
              const top = y(d.visits);
              const h = padT + plotH - top;
              const r = Math.min(4, h, barW / 2);
              return (
                <g key={d.day}>
                  {d.visits > 0 && (
                    <path
                      d={`M ${x} ${padT + plotH} V ${top + r} Q ${x} ${top} ${x + r} ${top} H ${x + barW - r} Q ${x + barW} ${top} ${x + barW} ${top + r} V ${padT + plotH} Z`}
                      fill={hover === i ? "#1e40af" : "#2563eb"}
                    />
                  )}
                  {/* Zone de survol plus large que la barre */}
                  <rect x={padL + i * slot} y={padT} width={slot} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
                  {(data.length - 1 - i) % 7 === 0 ? (
                    <text x={i === data.length - 1 ? x + barW : x + barW / 2} y={H - 8} textAnchor={i === data.length - 1 ? "end" : "middle"} fontSize="11" fill="#64748b">{label(d.day)}</text>
                  ) : null}
                </g>
              );
            })}
            <line x1={padL} x2={W} y1={padT + plotH} y2={padT + plotH} stroke="#cbd5e1" strokeWidth="1" />
          </svg>
          {hover !== null && (
            <div
              className="pointer-events-none absolute -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white shadow"
              style={{ left: `${((padL + hover * slot + slot / 2) / W) * 100}%`, top: 0 }}
            >
              {label(data[hover].day)} : <strong>{data[hover].visits}</strong> passage{data[hover].visits > 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
