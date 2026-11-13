"use client";

/** Pavé numérique tactile (grandes touches). */
export function Keypad({ onDigit, onDelete, onSubmit, submitLabel = "OK", submitDisabled, extraKey }: {
  onDigit: (d: string) => void;
  onDelete: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  extraKey?: { label: string; onPress: () => void };
}) {
  const key = "flex h-20 items-center justify-center rounded-2xl bg-white text-3xl font-semibold shadow-sm ring-1 ring-slate-200 active:bg-slate-100 sm:h-24";
  return (
    <div className="grid w-full max-w-md grid-cols-3 gap-3">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <button key={d} type="button" className={key} onClick={() => onDigit(d)}>{d}</button>
      ))}
      {extraKey ? (
        <button type="button" className={`${key} text-xl`} onClick={extraKey.onPress}>{extraKey.label}</button>
      ) : (
        <button type="button" className={`${key} text-2xl`} onClick={onDelete} aria-label="Effacer">⌫</button>
      )}
      <button type="button" className={key} onClick={() => onDigit("0")}>0</button>
      {onSubmit ? (
        <button type="button" className="flex h-20 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-brand-contrast shadow-sm active:opacity-90 disabled:opacity-30 sm:h-24" onClick={onSubmit} disabled={submitDisabled}>
          {submitLabel}
        </button>
      ) : (
        <button type="button" className={`${key} text-2xl`} onClick={onDelete} aria-label="Effacer">⌫</button>
      )}
    </div>
  );
}

/** Affichage de cases pour un code (PIN, SMS). */
export function CodeDots({ length, value }: { length: number; value: string }) {
  return (
    <div className="flex justify-center gap-3">
      {Array.from({ length }).map((_, i) => (
        <div key={i} className={`h-5 w-5 rounded-full ${i < value.length ? "bg-slate-900" : "bg-slate-200"}`} />
      ))}
    </div>
  );
}
