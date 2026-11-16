"use client";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { BigButton, Card, Icon, Screen, Skeleton, euros } from "./ui";

export interface SendPreset { templateKey?: string; segmentKey?: string }

interface Template {
  key: string;
  icon: string;
  label: string;
  hint: string;
  fields: { key: string; label: string; placeholder: string }[];
  text: string;
  offer: string | null;
  offerDays: number;
  suggestedSegment: string;
}
interface Segment { key: string; icon: string; label: string; description: string; count: number; reachable: number }
interface Preview {
  sample: string;
  sampleName: string | null;
  offerTitle: string | null;
  info: { encoding: "GSM" | "UNICODE"; length: number; parts: number; perPart: number };
  tooLong: boolean;
  segment: { label: string; icon: string };
  members: number;
  recipients: number;
  excluded: { noConsent: number; monthlyLimit: number };
  costCents: number;
  window: { open: boolean; reason: string | null };
  maxPerMonth: number;
}

type Step = "what" | "fill" | "who" | "preview" | "done";

export function SendFlow({ preset, onClose }: { preset: SendPreset; onClose: (sent: boolean) => void }) {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [step, setStep] = useState<Step>("what");
  const [tpl, setTpl] = useState<Template | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [freeText, setFreeText] = useState("");
  const [withOffer, setWithOffer] = useState(true);
  const [segmentKey, setSegmentKey] = useState<string | null>(preset.segmentKey ?? null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);

  useEffect(() => {
    Promise.all([api<Template[]>("/api/v1/app/templates"), api<Segment[]>("/api/v1/app/segments")])
      .then(([t, s]) => {
        setTemplates(t);
        setSegments(s);
        if (preset.templateKey) {
          const found = t.find((x) => x.key === preset.templateKey);
          if (found) choose(found);
        }
      })
      .catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (t: Template) => {
    setTpl(t);
    setFields({});
    setWithOffer(!!t.offer);
    setSegmentKey((k) => k ?? t.suggestedSegment);
    setStep("fill");
  };

  const input = () => ({ segmentKey, templateKey: tpl?.key, fields, freeText: tpl?.key === "free" ? freeText : undefined, withOffer });

  const loadPreview = async () => {
    setError(null);
    setPreview(null);
    try {
      setPreview(await api<Preview>("/api/v1/app/campaigns/preview", { body: input() }));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  useEffect(() => {
    if (step === "preview") loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, segmentKey]);

  const send = async () => {
    if (!preview) return;
    if (!confirm(`Envoyer ce SMS à ${preview.recipients} client${preview.recipients > 1 ? "s" : ""} ?`)) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api<{ sent: number; failed: number }>("/api/v1/app/campaigns", { body: input() }));
      setStep("done");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const fillComplete = tpl ? (tpl.key === "free" ? freeText.trim().length >= 5 : tpl.fields.every((f) => (fields[f.key] ?? "").trim())) : false;
  const offerPreview = tpl?.offer ? tpl.offer.replace(/\{(\w+)\}/g, (_, k: string) => fields[k] || "…") : null;

  if (!templates || !segments) {
    return <Screen title="Envoyer une offre" onBack={() => onClose(false)}>{error ? <Card className="text-red-700">{error}</Card> : <Skeleton />}</Screen>;
  }

  // 1. Quoi ?
  if (step === "what") {
    return (
      <Screen title="Que voulez-vous dire ?" subtitle="Étape 1 sur 3" onBack={() => onClose(false)}>
        <div className="grid grid-cols-2 gap-3">
          {templates.map((t) => (
            <Card key={t.key} onClick={() => choose(t)} className="p-4">
              <div className="text-3xl">{t.icon}</div>
              <div className="mt-2 text-base font-semibold leading-snug">{t.label}</div>
              <div className="mt-1 text-sm leading-snug text-slate-500">{t.hint}</div>
            </Card>
          ))}
        </div>
      </Screen>
    );
  }

  // 1 bis. Compléter
  if (step === "fill" && tpl) {
    return (
      <Screen
        title={`${tpl.icon} ${tpl.label}`}
        subtitle="Étape 1 sur 3 · complétez"
        onBack={() => setStep("what")}
        footer={<BigButton disabled={!fillComplete} onClick={() => setStep(preset.segmentKey ? "preview" : "who")}>Continuer</BigButton>}
      >
        {tpl.key === "free" ? (
          <Card>
            <label className="text-sm font-medium text-slate-500" htmlFor="free">Votre message</label>
            <textarea id="free" rows={5} maxLength={300} className="mt-2 w-full resize-none rounded-2xl bg-slate-50 p-4 text-lg outline-none focus:ring-2 focus:ring-slate-900" placeholder="Ex. : Nos sapins de Noel sont arrives ! Venez les choisir avant samedi." value={freeText} onChange={(e) => setFreeText(e.target.value)} />
            <div className="mt-1 text-right text-sm text-slate-400">{freeText.length} / 300 · évitez les emojis pour rester à 1 SMS</div>
          </Card>
        ) : (
          tpl.fields.map((f) => (
            <Card key={f.key}>
              <label className="text-sm font-medium text-slate-500" htmlFor={`f-${f.key}`}>{f.label}</label>
              <input id={`f-${f.key}`} className="mt-1 w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-slate-300" placeholder={f.placeholder} maxLength={80} value={fields[f.key] ?? ""} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />
            </Card>
          ))
        )}
        {tpl.fields.length === 0 && tpl.key !== "free" && (
          <Card className="text-slate-600">Rien à remplir : le message est personnalisé automatiquement pour chaque client (prénom, points, récompense).</Card>
        )}
        {tpl.offer && (
          <Card>
            <label className="flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold">Offre au comptoir</div>
                <div className="text-sm text-slate-500">« {offerPreview} » s&apos;affichera sur la tablette et la caisse quand le client viendra ({tpl.offerDays} jours).</div>
              </div>
              <input type="checkbox" className="h-7 w-7 shrink-0 accent-slate-900" checked={withOffer} onChange={(e) => setWithOffer(e.target.checked)} />
            </label>
          </Card>
        )}
      </Screen>
    );
  }

  // 2. À qui ?
  if (step === "who") {
    return (
      <Screen
        title="À qui l'envoyer ?"
        subtitle="Étape 2 sur 3"
        onBack={() => setStep("fill")}
        footer={<BigButton disabled={!segmentKey} onClick={() => setStep("preview")}>Voir l&apos;aperçu</BigButton>}
      >
        {segments.map((s) => {
          const selected = s.key === segmentKey;
          return (
            <Card key={s.key} onClick={() => s.reachable > 0 && setSegmentKey(s.key)} className={`${selected ? "ring-2 ring-slate-900" : ""} ${s.reachable === 0 ? "opacity-45" : ""}`}>
              <div className="flex items-center gap-4">
                <span className="text-2xl">{s.icon}</span>
                <div className="flex-1">
                  <div className="font-semibold">{s.label}</div>
                  <div className="text-sm text-slate-500">{s.reachable} client{s.reachable > 1 ? "s" : ""} recevront le SMS</div>
                </div>
                <span className={`flex h-7 w-7 items-center justify-center rounded-full ${selected ? "bg-slate-900 text-white" : "ring-2 ring-slate-200"}`}>{selected && <Icon.check className="h-4 w-4" />}</span>
              </div>
            </Card>
          );
        })}
      </Screen>
    );
  }

  // 3. Aperçu
  if (step === "preview") {
    const p = preview;
    const canSend = p && p.window.open && !p.tooLong && p.recipients > 0;
    return (
      <Screen
        title="Vérifiez et envoyez"
        subtitle="Étape 3 sur 3"
        onBack={() => setStep(preset.segmentKey ? "fill" : "who")}
        footer={
          <BigButton disabled={!canSend || busy} onClick={send}>
            {busy ? "Envoi en cours…" : p ? `Envoyer à ${p.recipients} client${p.recipients > 1 ? "s" : ""}` : "…"}
          </BigButton>
        }
      >
        {error && <Card className="text-red-700">{error}</Card>}
        {!p ? <Skeleton lines={2} /> : (
          <>
            <div className="rounded-[2rem] bg-slate-200/70 p-4">
              <div className="mb-2 text-center text-xs font-medium text-slate-500">Exemple{p.sampleName ? ` pour ${p.sampleName}` : ""}</div>
              <div className="max-w-[85%] rounded-3xl rounded-bl-md bg-white px-4 py-3 text-[17px] leading-snug shadow-sm">{p.sample}</div>
            </div>
            <Card className="space-y-3">
              <Row label="Groupe" value={`${p.segment.icon} ${p.segment.label}`} onEdit={preset.segmentKey ? undefined : () => setStep("who")} />
              <Row label="Destinataires" value={`${p.recipients} client${p.recipients > 1 ? "s" : ""}`} />
              <Row label="Longueur" value={`${p.info.parts} SMS par client${p.info.encoding === "UNICODE" ? " (emoji ou accent spécial)" : ""}`} />
              <Row label="Coût estimé" value={euros(p.costCents)} />
              {p.offerTitle && <Row label="Offre au comptoir" value={p.offerTitle} />}
            </Card>
            {(p.excluded.noConsent > 0 || p.excluded.monthlyLimit > 0) && (
              <Card className="text-sm text-slate-600">
                {p.excluded.noConsent > 0 && <p>🔒 {p.excluded.noConsent} client{p.excluded.noConsent > 1 ? "s" : ""} du groupe n&apos;{p.excluded.noConsent > 1 ? "ont" : "a"} pas accepté les offres : ils ne recevront rien.</p>}
                {p.excluded.monthlyLimit > 0 && <p className="mt-1">✋ {p.excluded.monthlyLimit} client{p.excluded.monthlyLimit > 1 ? "s ont" : " a"} déjà reçu {p.maxPerMonth} SMS ce mois-ci : on ne les dérange pas plus.</p>}
              </Card>
            )}
            {!p.window.open && <Card className="bg-amber-50 text-amber-900">🕘 {p.window.reason}</Card>}
            {p.tooLong && <Card className="bg-amber-50 text-amber-900">Message trop long : raccourcissez-le (2 SMS maximum).</Card>}
            {p.recipients === 0 && <Card className="bg-amber-50 text-amber-900">Personne dans ce groupe ne peut recevoir de SMS pour l&apos;instant.</Card>}
            <p className="px-2 text-center text-xs text-slate-400">La mention STOP est ajoutée automatiquement. Les numéros ne vous sont jamais montrés.</p>
          </>
        )}
      </Screen>
    );
  }

  // Envoyé
  return (
    <Screen title="C'est parti !">
      <div className="flex flex-col items-center py-10 text-center">
        <span className="animate-pop flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500 text-white"><Icon.check className="h-12 w-12" /></span>
        <p className="mt-6 text-2xl font-bold">{result?.sent ?? 0} SMS envoyé{(result?.sent ?? 0) > 1 ? "s" : ""}</p>
        {result && result.failed > 0 && <p className="mt-1 text-amber-700">{result.failed} n&apos;ont pas pu partir.</p>}
        <p className="mt-3 max-w-xs text-slate-500">Vous verrez dans « Résultats » combien de clients sont venus grâce à ce message.</p>
      </div>
      <BigButton onClick={() => onClose(true)}>Voir les résultats</BigButton>
    </Screen>
  );
}

function Row({ label, value, onEdit }: { label: string; value: string; onEdit?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="flex items-center gap-2 text-right font-semibold">
        {value}
        {onEdit && <button onClick={onEdit} className="text-sm font-medium text-slate-500 underline">Modifier</button>}
      </span>
    </div>
  );
}
