"use client";
import { KIcon } from "./KioskIcon";

/** Carte à tampons : le format que tout le monde comprend, version numérique. */
export function StampCard({ filled, total, rewardName, fresh = 0 }: { filled: number; total: number; rewardName: string; fresh?: number }) {
  const shown = Math.min(filled, total);
  const left = Math.max(0, total - shown);
  const cols = total <= 5 ? total : total <= 10 ? 5 : 6;
  return (
    <div className="k-card w-full rounded-3xl p-6">
      <div className="grid justify-center gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 3.5rem))` }}>
        {Array.from({ length: total }).map((_, i) => {
          const on = i < shown;
          const isNew = on && i >= shown - fresh;
          return (
            <span
              key={i}
              className={`flex aspect-square items-center justify-center rounded-full border-2 ${on ? "border-transparent bg-brand text-brand-contrast" : "border-dashed"} ${isNew ? "animate-pop" : ""}`}
              style={{ borderColor: on ? undefined : "var(--k-line)", animationDelay: isNew ? `${0.3 + (i - (shown - fresh)) * 0.2}s` : undefined }}
            >
              {on ? <KIcon name="check" className="h-6 w-6" /> : <span className="k-muted text-sm">{i + 1}</span>}
            </span>
          );
        })}
      </div>
      <p className="mt-4 text-center text-xl">
        {left === 0 ? <strong>Carte complète : {rewardName} !</strong> : <>Encore <strong>{left} passage{left > 1 ? "s" : ""}</strong> pour : {rewardName}</>}
      </p>
    </div>
  );
}

/** QR code « Laissez-nous un avis ». Aucune contrepartie (règles de Google). */
export function ReviewQr({ svg, merchantName }: { svg: string; merchantName: string }) {
  return (
    <div className="k-card flex w-full items-center gap-5 rounded-3xl p-5 text-left">
      <div className="h-28 w-28 shrink-0 rounded-xl bg-white p-1.5" dangerouslySetInnerHTML={{ __html: svg }} />
      <div>
        <div className="text-xl font-semibold">Vous aimez {merchantName} ?</div>
        <div className="k-muted">Votre avis Google nous aide beaucoup. Scannez avec votre téléphone.</div>
      </div>
    </div>
  );
}
