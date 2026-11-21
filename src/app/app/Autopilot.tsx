"use client";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { BigButton, Card, Screen, Skeleton, euros } from "./ui";
import { Tile } from "./icons";
import type { KioskIconName } from "@/components/KioskIcon";

export interface AutomationItem {
  kind: string;
  label: string;
  when: string;
  settings: { key: string; label: string; type: "days" | "visits" | "offer" }[];
  canOffer: boolean;
  enabled: boolean;
  message: string;
  defaultMessage: string;
  params: Record<string, string | number | null>;
  needsReviewUrl: boolean;
  last30: { sent: number; visitors: number; revenueCents: number };
}

export const AUTOMATION_ICON: Record<string, KioskIconName> = {
  WELCOME: "sparkle", REWARD_READY: "gift", WIN_BACK: "heart", LOYALTY_ANNIVERSARY: "cake", POINTS_EXPIRING: "calendar", REVIEW_REQUEST: "star",
};

const VARS: { key: string; label: string; sample: string }[] = [
  { key: "prenom", label: "Prénom", sample: "Léa" },
  { key: "commerce", label: "Commerce", sample: "votre commerce" },
  { key: "points", label: "Points", sample: "120" },
  { key: "recompense", label: "Récompense", sample: "Café offert" },
  { key: "offre", label: "Cadeau", sample: "un croissant offert" },
  { key: "date_expiration", label: "Date d'expiration", sample: "12 décembre" },
  { key: "lien_avis", label: "Lien avis Google", sample: "https://g.page/r/…" },
];

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={(e) => { e.stopPropagation(); onChange(!on); }} className={`relative h-8 w-14 shrink-0 rounded-full transition ${on ? "bg-emerald-500" : "bg-slate-300"}`}>
      <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-7" : "left-1"}`} />
    </button>
  );
}

export function Autopilot({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<AutomationItem[] | null>(null);
  const [edit, setEdit] = useState<AutomationItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api<AutomationItem[]>("/api/v1/automations").then(setItems).catch((e) => setError(errorMessage(e))), []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (a: AutomationItem, enabled: boolean) => {
    if (a.needsReviewUrl && enabled) return setEdit(a);
    setItems((list) => list?.map((x) => (x.kind === a.kind ? { ...x, enabled } : x)) ?? null);
    try {
      await api(`/api/v1/automations/${a.kind}`, { method: "PATCH", body: { enabled } });
    } catch (e) {
      setError(errorMessage(e));
      load();
    }
  };

  if (edit) return <EditAutomation item={edit} onBack={() => { setEdit(null); load(); }} />;

  const active = items?.filter((a) => a.enabled).length ?? 0;
  const totals = (items ?? []).reduce((s, a) => ({ visitors: s.visitors + a.last30.visitors, revenue: s.revenue + a.last30.revenueCents }), { visitors: 0, revenue: 0 });

  return (
    <Screen title="Pilote automatique" subtitle="Les bons messages, au bon moment, sans y penser" onBack={onClose}>
      {error && <Card className="text-red-700">{error}</Card>}
      {!items ? <Skeleton lines={4} /> : (
        <>
          <Card tone="dark">
            <div className="text-sm text-slate-300">30 derniers jours · {active} message{active > 1 ? "s" : ""} actif{active > 1 ? "s" : ""}</div>
            <div className="mt-2 flex items-end gap-6">
              <div><div className="text-5xl font-bold tabular-nums">{totals.visitors}</div><div className="text-slate-300">clients revenus</div></div>
              <div><div className="text-3xl font-bold tabular-nums text-emerald-300">{euros(totals.revenue)}</div><div className="text-slate-300">d&apos;achats</div></div>
            </div>
          </Card>
          {items.map((a) => (
            <Card key={a.kind} onClick={() => setEdit(a)}>
              <div className="flex items-start gap-4">
                <Tile name={AUTOMATION_ICON[a.kind] ?? "sparkle"} />
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-semibold">{a.label}</div>
                  <div className="text-sm text-slate-500">{a.when}</div>
                  <div className="mt-2 text-sm font-medium text-slate-700">
                    {a.last30.sent > 0 ? `${a.last30.sent} envoyé${a.last30.sent > 1 ? "s" : ""} · ${a.last30.visitors} revenu${a.last30.visitors > 1 ? "s" : ""} · ${euros(a.last30.revenueCents)}` : a.enabled ? "Actif, rien à envoyer pour l'instant" : "Désactivé"}
                  </div>
                </div>
                <Switch on={a.enabled} onChange={(v) => toggle(a, v)} label={`Activer ${a.label}`} />
              </div>
            </Card>
          ))}
          <p className="px-2 text-center text-sm text-slate-400">
            Seuls les clients qui ont accepté les offres reçoivent ces SMS, entre 9 h et 20 h, jamais le dimanche, et dans la limite de SMS par mois que vous avez fixée.
          </p>
        </>
      )}
    </Screen>
  );
}

function EditAutomation({ item, onBack }: { item: AutomationItem; onBack: () => void }) {
  const [message, setMessage] = useState(item.message);
  const [params, setParams] = useState(item.params);
  const [reviewUrl, setReviewUrl] = useState("");
  const [enabled, setEnabled] = useState(item.enabled || item.needsReviewUrl);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = message.replace(/\{(\w+)\}/g, (m, k: string) => {
    if (k === "offre") return (params.offer as string) || "une petite attention";
    return VARS.find((v) => v.key === k)?.sample ?? m;
  });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (item.needsReviewUrl && reviewUrl) await api("/api/v1/settings/branding", { method: "PATCH", body: { googleReviewUrl: reviewUrl } });
      await api(`/api/v1/automations/${item.kind}`, {
        method: "PATCH",
        body: {
          enabled,
          message,
          params: Object.fromEntries(
            item.settings.map((s) => [s.key, s.type === "offer" ? ((params[s.key] as string) || null) : Number(params[s.key])]),
          ),
        },
      });
      onBack();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={item.label} subtitle={item.when} onBack={onBack} footer={<BigButton onClick={save} disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</BigButton>}>
      {error && <Card className="text-red-700">{error}</Card>}
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div className="text-lg font-semibold">Activer ce message</div>
          <Switch on={enabled} onChange={setEnabled} label="Activer ce message" />
        </div>
      </Card>
      {item.needsReviewUrl && (
        <Card>
          <label className="text-sm font-medium text-slate-500" htmlFor="review-url">Lien de votre fiche Google (« Demander des avis »)</label>
          <input id="review-url" className="mt-1 w-full bg-transparent text-lg outline-none placeholder:text-slate-300" placeholder="https://g.page/r/…/review" value={reviewUrl} onChange={(e) => setReviewUrl(e.target.value)} />
          <p className="mt-2 text-sm text-slate-500">Dans Google Business Profile : « Demander des avis », puis copier le lien. On ne donne rien en échange d&apos;un avis : c&apos;est interdit par Google.</p>
        </Card>
      )}
      <Card>
        <label className="text-sm font-medium text-slate-500" htmlFor="auto-msg">Message</label>
        <textarea id="auto-msg" rows={4} maxLength={300} className="mt-2 w-full resize-none rounded-2xl bg-slate-50 p-4 text-lg outline-none focus:ring-2 focus:ring-slate-900" value={message} onChange={(e) => setMessage(e.target.value)} />
        <div className="mt-2 flex flex-wrap gap-2">
          {VARS.filter((v) => v.key !== "lien_avis" || item.kind === "REVIEW_REQUEST").filter((v) => v.key !== "offre" || item.canOffer).map((v) => (
            <button key={v.key} type="button" className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium" onClick={() => setMessage((m) => `${m.trimEnd()} {${v.key}}`)}>+ {v.label}</button>
          ))}
          {message !== item.defaultMessage && <button type="button" className="rounded-full px-3 py-1.5 text-sm text-slate-500 underline" onClick={() => setMessage(item.defaultMessage)}>Texte conseillé</button>}
        </div>
      </Card>
      {item.settings.map((s) => (
        <Card key={s.key}>
          <label className="text-sm font-medium text-slate-500" htmlFor={`p-${s.key}`}>{s.label}</label>
          <input
            id={`p-${s.key}`}
            className="mt-1 w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-slate-300"
            inputMode={s.type === "offer" ? "text" : "numeric"}
            placeholder={s.type === "offer" ? "ex. un café offert" : ""}
            value={(params[s.key] ?? "") as string | number}
            onChange={(e) => setParams({ ...params, [s.key]: s.type === "offer" ? e.target.value : e.target.value.replace(/\D/g, "") })}
          />
          {s.type === "offer" && <p className="mt-1 text-sm text-slate-500">S&apos;affiche sur la tablette et la caisse quand le client revient. Ajoutez {"{offre}"} dans le message pour l&apos;annoncer.</p>}
        </Card>
      ))}
      <div className="rounded-[2rem] bg-slate-200/70 p-4">
        <div className="mb-2 text-center text-xs font-medium text-slate-500">Aperçu</div>
        <div className="max-w-[85%] rounded-3xl rounded-bl-md bg-white px-4 py-3 text-[17px] leading-snug shadow-sm">{preview} STOP SMS : répondez STOP</div>
      </div>
    </Screen>
  );
}
