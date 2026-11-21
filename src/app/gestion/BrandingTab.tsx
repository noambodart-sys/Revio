"use client";
import { useState } from "react";
import { api, contrastTriple, errorMessage, hexToRgbTriple } from "@/lib/api";
import type { Flash, Settings } from "./types";
import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/playfair-display";
import "@fontsource-variable/bricolage-grotesque";

type Theme = "moderne" | "chaleureux" | "elegant" | "pop";
const THEMES: { key: Theme; label: string; hint: string }[] = [
  { key: "moderne", label: "Moderne", hint: "Clair et net" },
  { key: "chaleureux", label: "Chaleureux", hint: "Tons crème, typographie à empattements" },
  { key: "elegant", label: "Élégant", hint: "Fond sombre, raffiné" },
  { key: "pop", label: "Pop", hint: "Votre couleur en grand" },
];

/** Redimensionne une image dans le navigateur : le fichier envoyé reste léger. */
function resizeImage(file: File, max: number, type: "image/png" | "image/jpeg", quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL(type, quality));
    };
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = url;
  });
}

export function BrandingTab({ settings, flash, onSaved }: { settings: Settings; flash: Flash; onSaved: () => void }) {
  const m = settings.merchant;
  const [theme, setTheme] = useState<Theme>((m.kioskTheme as Theme) ?? "moderne");
  const [color, setColor] = useState(m.primaryColor ?? "#2563eb");
  const [logo, setLogo] = useState<string | null>(m.logoUrl);
  const [background, setBackground] = useState<string | null>(m.kioskBackground);
  const [title, setTitle] = useState(m.kioskTitle ?? "");
  const [message, setMessage] = useState(m.kioskMessage ?? "");
  const [busy, setBusy] = useState(false);

  const rgb = hexToRgbTriple(color) ?? "37 99 235";
  const vars = (_t: Theme, withPhoto = false) =>
    ({
      "--brand": rgb,
      "--brand-contrast": contrastTriple(rgb),
      ...(withPhoto && background ? { backgroundImage: `linear-gradient(var(--k-overlay), var(--k-overlay)), url(${background})`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
    }) as React.CSSProperties;

  const onFile = (kind: "logo" | "background") => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return flash(false, "Formats acceptés : PNG, JPEG, WebP");
    try {
      if (kind === "logo") setLogo(await resizeImage(file, 256, "image/png"));
      else setBackground(await resizeImage(file, 1600, "image/jpeg", 0.8));
    } catch (err) {
      flash(false, errorMessage(err));
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await api("/api/v1/settings/branding", {
        method: "PATCH",
        body: { kioskTheme: theme, primaryColor: color, logoUrl: logo, kioskBackground: background, kioskTitle: title.trim() || null, kioskMessage: message.trim() || null },
      });
      flash(true, "Apparence enregistrée. La tablette l'affichera à son prochain retour à l'accueil.");
      onSaved();
    } catch (e) {
      flash(false, errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const displayTitle = title.trim() || `Bienvenue chez ${m.name}`;

  return (
    <div className="space-y-5">
      <section className="card space-y-4">
        <h2 className="text-xl font-semibold">Style de la tablette</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {THEMES.map((t) => (
            <button key={t.key} type="button" onClick={() => setTheme(t.key)} className={`overflow-hidden rounded-2xl text-left ring-2 transition ${theme === t.key ? "ring-slate-900" : "ring-transparent hover:ring-slate-300"}`}>
              <div className="kiosk px-4 py-5" data-theme={t.key} style={vars(t.key)}>
                <div className="text-xl font-bold leading-tight" style={{ fontFamily: "var(--k-font-display)" }}>Bienvenue</div>
                <div className="k-muted text-sm">Cumulez des points</div>
                <div className="mt-3 flex gap-1.5">
                  {[1, 2, 3].map((n) => <span key={n} className="keypad-key flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold">{n}</span>)}
                  <span className="flex h-8 w-10 items-center justify-center rounded-lg bg-brand text-xs font-bold text-brand-contrast">OK</span>
                </div>
              </div>
              <div className="bg-white px-4 py-3">
                <div className="font-semibold">{t.label}</div>
                <div className="text-sm text-slate-500">{t.hint}</div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card space-y-5">
          <div>
            <label className="label" htmlFor="kioskTitle">Titre d&apos;accueil</label>
            <input id="kioskTitle" className="input" maxLength={80} placeholder={`Bienvenue chez ${m.name}`} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="kioskMessage">Message du jour</label>
            <input id="kioskMessage" className="input" maxLength={200} placeholder="ex. Le pain aux noix est de retour !" value={message} onChange={(e) => setMessage(e.target.value)} />
            <p className="mt-1 text-sm text-slate-500">Sous le titre, et en grand quand la tablette est en veille.</p>
          </div>
          <div>
            <label className="label">Couleur principale</label>
            <div className="flex items-center gap-3">
              <input type="color" aria-label="Couleur principale" className="h-12 w-20 cursor-pointer rounded-lg border border-slate-300" value={color} onChange={(e) => setColor(e.target.value)} />
              <input className="input w-40 font-mono" aria-label="Code couleur" value={color} maxLength={7} onChange={(e) => setColor(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="label">Logo</div>
              <div className="flex items-center gap-3">
                {logo ? <img src={logo} alt="Logo" className="h-14 w-14 rounded-lg object-contain ring-1 ring-slate-200" /> : <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">aucun</div>}
                <div className="flex flex-col gap-1">
                  <label className="btn-ghost cursor-pointer px-3 py-2 text-sm">Choisir<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={onFile("logo")} /></label>
                  {logo && <button type="button" className="text-sm text-red-700 underline" onClick={() => setLogo(null)}>Retirer</button>}
                </div>
              </div>
            </div>
            <div>
              <div className="label">Photo de fond</div>
              <div className="flex items-center gap-3">
                {background ? <img src={background} alt="Fond" className="h-14 w-20 rounded-lg object-cover ring-1 ring-slate-200" /> : <div className="flex h-14 w-20 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">aucune</div>}
                <div className="flex flex-col gap-1">
                  <label className="btn-ghost cursor-pointer px-3 py-2 text-sm">Choisir<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={onFile("background")} /></label>
                  {background && <button type="button" className="text-sm text-red-700 underline" onClick={() => setBackground(null)}>Retirer</button>}
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-500">Une photo de votre vitrine ou de vos produits. Elle est voilée pour que le texte reste lisible.</p>
            </div>
          </div>
          <button className="btn-dark w-full" disabled={busy || !/^#[0-9a-fA-F]{6}$/.test(color)} onClick={save}>Enregistrer</button>
        </section>

        <section className="card space-y-3">
          <div className="text-sm font-medium text-slate-500">Aperçu de l&apos;accueil</div>
          <div className="kiosk overflow-hidden rounded-2xl" data-theme={theme} style={vars(theme, true)}>
            <div className="flex items-center gap-3 px-5 py-4">
              {logo ? <img src={logo} alt="" className="h-10 w-10 rounded-lg bg-white object-contain" /> : <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand font-black text-brand-contrast">{m.name.slice(0, 1)}</div>}
              <span className="text-lg font-bold">{m.name}</span>
            </div>
            <div className="space-y-3 px-6 pb-8 pt-6">
              <h1 className="text-4xl font-black leading-tight">{displayTitle}</h1>
              <p className="k-muted text-lg">{message.trim() || "Cumulez des points à chaque visite."}</p>
              <div className="k-card mt-4 rounded-2xl p-4">
                <div className="k-muted mb-2 text-center text-sm">Tapez votre numéro de GSM</div>
                <div className="grid grid-cols-3 gap-2">
                  {["1", "2", "3", "4", "5", "6"].map((n) => <span key={n} className="keypad-key flex h-11 items-center justify-center rounded-xl text-lg font-semibold">{n}</span>)}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
