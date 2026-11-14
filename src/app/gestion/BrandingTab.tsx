"use client";
import { useState } from "react";
import { api, contrastTriple, errorMessage, hexToRgbTriple } from "@/lib/api";
import type { Flash, Settings } from "./types";

/** Redimensionne l'image dans le navigateur (256 px max) : le fichier envoyé reste léger. */
function resizeImage(file: File, max = 256): Promise<string> {
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
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = url;
  });
}

export function BrandingTab({ settings, flash, onSaved }: { settings: Settings; flash: Flash; onSaved: () => void }) {
  const [color, setColor] = useState(settings.merchant.primaryColor ?? "#2563eb");
  const [logo, setLogo] = useState<string | null>(settings.merchant.logoUrl);
  const [busy, setBusy] = useState(false);

  const rgb = hexToRgbTriple(color) ?? "37 99 235";
  const preview = { "--brand": rgb, "--brand-contrast": contrastTriple(rgb) } as React.CSSProperties;

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return flash(false, "Formats acceptés : PNG, JPEG, WebP");
    try {
      setLogo(await resizeImage(file));
    } catch (err) {
      flash(false, errorMessage(err));
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await api("/api/v1/settings/branding", { method: "PATCH", body: { primaryColor: color, logoUrl: logo } });
      flash(true, "Apparence enregistrée. La tablette l'affichera au prochain retour à l'accueil.");
      onSaved();
    } catch (e) {
      flash(false, errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card space-y-5">
        <h2 className="text-xl font-semibold">Apparence de la tablette</h2>
        <div>
          <label className="label">Couleur principale</label>
          <div className="flex items-center gap-3">
            <input type="color" className="h-12 w-20 cursor-pointer rounded-lg border border-slate-300" value={color} onChange={(e) => setColor(e.target.value)} />
            <input className="input w-40 font-mono" value={color} maxLength={7} onChange={(e) => setColor(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Logo (PNG, JPEG ou WebP)</label>
          <div className="flex items-center gap-4">
            {logo ? <img src={logo} alt="Logo" className="h-16 w-16 rounded-lg object-contain ring-1 ring-slate-200" /> : <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">aucun</div>}
            <label className="btn-ghost cursor-pointer">
              Choisir une image
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={onFile} />
            </label>
            {logo && <button type="button" className="text-sm text-red-700 underline" onClick={() => setLogo(null)}>Retirer</button>}
          </div>
        </div>
        <button className="btn-dark w-full" disabled={busy || !/^#[0-9a-fA-F]{6}$/.test(color)} onClick={save}>Enregistrer</button>
      </div>

      <div className="card space-y-3">
        <div className="text-sm font-medium text-slate-500">Aperçu</div>
        <div style={preview} className="overflow-hidden rounded-2xl bg-gradient-to-b from-white to-slate-100 ring-1 ring-slate-200">
          <div className="flex items-center gap-3 px-5 py-4">
            {logo && <img src={logo} alt="" className="h-10 w-10 rounded-lg object-cover" />}
            <span className="text-lg font-bold">{settings.merchant.name}</span>
          </div>
          <div className="space-y-4 px-5 pb-6 text-center">
            <div className="text-2xl font-bold">Cumulez vos points</div>
            <div className="text-5xl font-black text-brand">125</div>
            <div className="text-slate-600">points</div>
            <div className="btn-brand w-full py-4 text-lg">Recevoir mon code par SMS</div>
          </div>
        </div>
      </div>
    </div>
  );
}
