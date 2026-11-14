"use client";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, formatDate } from "@/lib/api";
import type { Flash } from "./types";

interface DataRequest {
  id: string;
  customerId: string | null;
  type: "ACCESS" | "PORTABILITY" | "RECTIFICATION" | "ERASURE" | "MARKETING_OPT_OUT";
  status: "OPEN" | "IN_PROGRESS" | "CLOSED" | "REJECTED";
  notes: string | null;
  requestedAt: string;
  dueAt: string;
  closedAt: string | null;
}

const TYPE: Record<DataRequest["type"], string> = {
  ACCESS: "Accès à ses données",
  PORTABILITY: "Copie de ses données (portabilité)",
  RECTIFICATION: "Rectification",
  ERASURE: "Suppression",
  MARKETING_OPT_OUT: "Arrêt des offres (marketing)",
};
const STATUS: Record<DataRequest["status"], string> = { OPEN: "À traiter", IN_PROGRESS: "En cours", CLOSED: "Traitée", REJECTED: "Refusée" };
const HOWTO: Record<DataRequest["type"], string> = {
  ACCESS: "Fiche client › « Exporter ses données », puis remettez le fichier au client.",
  PORTABILITY: "Fiche client › « Exporter ses données » (fichier réutilisable).",
  RECTIFICATION: "Fiche client › « Rectifier ».",
  ERASURE: "Fiche client › « Supprimer ».",
  MARKETING_OPT_OUT: "Fiche client › « Désinscrire du marketing ».",
};

export function RequestsTab({ flash }: { flash: Flash }) {
  const [items, setItems] = useState<DataRequest[]>([]);
  const [type, setType] = useState<DataRequest["type"]>("ACCESS");
  const [notes, setNotes] = useState("");

  const load = useCallback(() => api<DataRequest[]>("/api/v1/gdpr/requests").then(setItems).catch((e) => flash(false, errorMessage(e))), [flash]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    try {
      await api("/api/v1/gdpr/requests", { body: { type, notes: notes.trim() || null } });
      setNotes("");
      flash(true, "Demande enregistrée. Délai légal : 1 mois.");
      load();
    } catch (e) {
      flash(false, errorMessage(e));
    }
  };

  const setStatus = async (id: string, status: DataRequest["status"]) => {
    try {
      await api(`/api/v1/gdpr/requests/${id}`, { method: "PATCH", body: { status } });
      load();
    } catch (e) {
      flash(false, errorMessage(e));
    }
  };

  const now = Date.now();
  const open = items.filter((r) => r.status === "OPEN" || r.status === "IN_PROGRESS");
  const done = items.filter((r) => r.status === "CLOSED" || r.status === "REJECTED");

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <div className="card">
          <h2 className="mb-1 text-xl font-semibold">Demandes à traiter</h2>
          <p className="mb-3 text-slate-600">Quand un client exerce un droit sur ses données, notez-le ici et répondez dans le mois.</p>
          {open.length === 0 && <p className="text-slate-500">Aucune demande en cours. ✓</p>}
          <ul className="divide-y divide-slate-100">
            {open.map((r) => {
              const late = new Date(r.dueAt).getTime() < now;
              return (
                <li key={r.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{TYPE[r.type]} <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-sm">{STATUS[r.status]}</span></div>
                    <div className={`text-sm ${late ? "font-semibold text-red-700" : "text-slate-500"}`}>
                      {late ? "⚠️ En retard — " : ""}à traiter avant le {formatDate(r.dueAt)}
                    </div>
                  </div>
                  {r.notes && <div className="text-sm text-slate-600">{r.notes}</div>}
                  <div className="text-sm text-slate-500">Comment : {HOWTO[r.type]}</div>
                  <div className="flex gap-2">
                    {r.status === "OPEN" && <button className="btn-ghost px-3 py-2 text-sm" onClick={() => setStatus(r.id, "IN_PROGRESS")}>En cours</button>}
                    <button className="btn-dark px-3 py-2 text-sm" onClick={() => setStatus(r.id, "CLOSED")}>Marquer traitée</button>
                    <button className="btn-ghost px-3 py-2 text-sm" onClick={() => setStatus(r.id, "REJECTED")}>Refuser</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        {done.length > 0 && (
          <div className="card">
            <h3 className="mb-2 text-lg font-semibold">Historique</h3>
            <ul className="divide-y divide-slate-100 text-sm">
              {done.map((r) => (
                <li key={r.id} className="flex justify-between py-2">
                  <span>{TYPE[r.type]}{r.notes ? ` — ${r.notes}` : ""}</span>
                  <span className="text-slate-500">{STATUS[r.status]} le {r.closedAt ? formatDate(r.closedAt) : "—"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <form className="card space-y-3 self-start" onSubmit={(e) => { e.preventDefault(); create(); }}>
        <h3 className="text-lg font-semibold">Noter une demande</h3>
        <div>
          <label className="label">Le client demande…</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as DataRequest["type"])}>
            {Object.entries(TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Note (facultatif)</label>
          <input className="input" value={notes} maxLength={300} placeholder="ex. Prénom + 2 derniers chiffres du numéro" onChange={(e) => setNotes(e.target.value)} />
        </div>
        <button className="btn-dark w-full">Enregistrer</button>
        <p className="text-sm text-slate-500">N&apos;écrivez pas le numéro complet du client dans la note.</p>
      </form>
    </div>
  );
}
