"use client";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Flash, TemplateInfo } from "./types";

export function TemplatePicker({ templates, current, flash, onApplied, confirmFirst }: {
  templates: TemplateInfo[];
  current: string | null;
  flash: Flash;
  onApplied: () => void;
  confirmFirst?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const apply = async (t: TemplateInfo) => {
    if (confirmFirst && !confirm(`Appliquer le modèle « ${t.label} » ? Vos réglages actuels seront remplacés.`)) return;
    setBusy(true);
    try {
      await api("/api/v1/settings/template", { body: { key: t.key } });
      flash(true, `Modèle « ${t.label} » appliqué. Tout reste modifiable.`);
      onApplied();
    } catch (e) {
      flash(false, errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {templates.map((t) => (
        <button
          key={t.key}
          type="button"
          disabled={busy}
          onClick={() => apply(t)}
          className={`rounded-2xl p-4 text-left ring-1 transition hover:shadow-md disabled:opacity-50 ${current === t.key ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-200"}`}
        >
          <div className="text-3xl">{t.emoji}</div>
          <div className="mt-2 font-semibold">{t.label}</div>
          <div className={`mt-1 text-sm ${current === t.key ? "text-slate-300" : "text-slate-500"}`}>{t.pitch}</div>
        </button>
      ))}
    </div>
  );
}
