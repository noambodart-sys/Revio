"use client";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, formatDate } from "@/lib/api";
import type { Flash } from "./types";

interface Row {
  id: string;
  firstName: string | null;
  maskedPhone: string | null;
  balance: number;
  tier: string | null;
  visits: number;
  enrolledAt: string;
  lastVisitAt: string | null;
  marketingSms: boolean;
}

export function CustomersTab({ flash }: { flash: Flash }) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Row[]; total: number; pageSize: number } | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), ...(query ? { q: query } : {}) });
    api<{ items: Row[]; total: number; pageSize: number }>(`/api/v1/backoffice/customers?${params}`).then(setData).catch((e) => flash(false, errorMessage(e)));
  }, [page, query, flash]);

  useEffect(load, [load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Clients {data ? <span className="text-slate-500">({data.total})</span> : null}</h2>
        <a className="btn-ghost" href="/api/v1/backoffice/customers/export">Exporter (Excel / CSV)</a>
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q.trim()); }}>
        <input className="input" placeholder="Prénom ou numéro complet (0470 12 34 56)" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-dark">Rechercher</button>
        {query && <button type="button" className="btn-ghost" onClick={() => { setQ(""); setQuery(""); setPage(1); }}>Tout afficher</button>}
      </form>
      <p className="text-sm text-slate-500">
        Les numéros sont masqués. Pour rechercher un numéro, tapez-le en entier. Cliquez sur un client pour ouvrir sa fiche (points, historique, export, suppression).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-sm text-slate-500">
            <tr>
              <th className="py-2 pr-3">Client</th>
              <th className="pr-3 text-right">Solde</th>
              <th className="pr-3">Niveau</th>
              <th className="pr-3 text-right">Passages</th>
              <th className="pr-3">Dernière visite</th>
              <th className="pr-3">Inscription</th>
              <th>SMS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.map((c) => (
              <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => (window.location.href = `/caisse?client=${c.id}`)}>
                <td className="py-2 pr-3">
                  <div className="font-medium">{c.firstName ?? "—"}</div>
                  <div className="text-sm text-slate-500">{c.maskedPhone}</div>
                </td>
                <td className="pr-3 text-right font-semibold tabular-nums">{c.balance}</td>
                <td className="pr-3">{c.tier ?? "—"}</td>
                <td className="pr-3 text-right tabular-nums">{c.visits}</td>
                <td className="pr-3 text-sm">{c.lastVisitAt ? formatDate(c.lastVisitAt) : "jamais"}</td>
                <td className="pr-3 text-sm">{formatDate(c.enrolledAt)}</td>
                <td className="text-sm">{c.marketingSms ? "oui" : "non"}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-slate-500">{query ? "Aucun client trouvé." : "Aucun client inscrit pour l'instant."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Précédent</button>
          <span className="text-slate-600">Page {page} / {pages}</span>
          <button className="btn-ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Suivant →</button>
        </div>
      )}
    </div>
  );
}
