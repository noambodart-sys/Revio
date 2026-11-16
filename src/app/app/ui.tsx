"use client";
/** Briques visuelles de l'appli du commerçant : simples, grandes, lisibles. */

export const Icon = {
  home: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={p.className}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></svg>
  ),
  users: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={p.className}><circle cx="9" cy="8" r="4" /><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7" /><path d="M16 4.1a4 4 0 0 1 0 7.8M18 14.5c2.4.9 4 3.3 4 6.5" /></svg>
  ),
  send: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={p.className}><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></svg>
  ),
  chart: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={p.className}><path d="M3 3v18h18" /><path d="M7 15v3M12 10v8M17 6v12" /></svg>
  ),
  back: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={p.className}><path d="M15 18 9 12l6-6" /></svg>
  ),
  chevron: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={p.className}><path d="m9 18 6-6-6-6" /></svg>
  ),
  check: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className={p.className}><path d="M20 6 9 17l-5-5" /></svg>
  ),
};

export function Card({ children, className = "", onClick, tone = "white" }: { children: React.ReactNode; className?: string; onClick?: () => void; tone?: "white" | "dark" | "amber" }) {
  const bg = tone === "dark" ? "bg-slate-900 text-white" : tone === "amber" ? "bg-amber-400 text-slate-900" : "bg-white";
  const cls = `rounded-3xl ${bg} p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${onClick ? "w-full text-left transition active:scale-[0.98]" : ""} ${className}`;
  return onClick ? <button className={cls} onClick={onClick}>{children}</button> : <div className={cls}>{children}</div>;
}

/** `aboveNav` : l'écran s'affiche avec la barre d'onglets en bas ; le bouton du pied se place au-dessus. */
export function Screen({ title, subtitle, onBack, children, footer, aboveNav }: { title: string; subtitle?: string; onBack?: () => void; children: React.ReactNode; footer?: React.ReactNode; aboveNav?: boolean }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col">
      <header className="sticky top-0 z-10 bg-[#f6f6f4]/90 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur">
        {onBack && (
          <button onClick={onBack} className="-ml-2 mb-1 flex items-center gap-1 rounded-full px-2 py-1 text-base font-medium text-slate-600" aria-label="Retour">
            <Icon.back className="h-5 w-5" /> Retour
          </button>
        )}
        <h1 className="text-[28px] font-bold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-base text-slate-500">{subtitle}</p>}
      </header>
      <main className={`flex-1 space-y-3 px-4 ${aboveNav && footer ? "pb-52" : "pb-32"}`}>{children}</main>
      {footer && (
        <div className={`fixed inset-x-0 z-20 mx-auto max-w-lg bg-gradient-to-t from-[#f6f6f4] via-[#f6f6f4] px-4 pt-6 ${aboveNav ? "bottom-[calc(4.75rem+env(safe-area-inset-bottom))] pb-3" : "bottom-0 pb-[max(1rem,env(safe-area-inset-bottom))]"}`}>
          {footer}
        </div>
      )}
    </div>
  );
}

export function BigButton({ children, onClick, disabled, variant = "dark" }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: "dark" | "light" }) {
  const cls =
    variant === "dark"
      ? "bg-slate-900 text-white disabled:bg-slate-300"
      : "bg-white text-slate-900 ring-1 ring-slate-200 disabled:text-slate-300";
  return (
    <button onClick={onClick} disabled={disabled} className={`flex h-16 w-full items-center justify-center gap-2 rounded-2xl text-lg font-semibold transition active:scale-[0.98] ${cls}`}>
      {children}
    </button>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: lines }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-3xl bg-white/70" />)}
    </div>
  );
}

export const euros = (cents: number) => (cents / 100).toLocaleString("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: cents % 100 ? 2 : 0 });

export function relativeDay(d: string | Date | null) {
  if (!d) return "jamais";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 30) return `il y a ${days} jours`;
  const months = Math.floor(days / 30);
  return `il y a ${months} mois`;
}
