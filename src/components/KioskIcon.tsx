/** Icônes sobres de la tablette (à la place des emojis). */
const PATHS: Record<string, React.ReactNode> = {
  bag: <><path d="M6 7h12l-1 13H7z" /><path d="M9 7a3 3 0 0 1 6 0" /></>,
  star: <path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" />,
  flame: <path d="M12 3c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-1.8.8-3 1.8-4 .2 1.5 1 2.3 2 2.5-.6-2.5-.3-4.6.2-7z" />,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  gift: <><rect x="3" y="8" width="18" height="5" rx="1" /><path d="M5 13v8h14v-8M12 8v13M12 8C9 8 7.5 4 10 4c1.5 0 2 2 2 4zm0 0c3 0 4.5-4 2-4-1.5 0-2 2-2 4z" /></>,
  cake: <><path d="M4 21V12h16v9M3 21h18M4 15c2 1.5 4 1.5 6 0s4-1.5 6 0 3 1.5 4 0" /><path d="M12 8v4M12 4.5c.8.8.8 1.8 0 2.5-.8-.7-.8-1.7 0-2.5z" /></>,
  steps: <><path d="M7 4c1.7 0 2.5 2 2.5 4.5S8.5 13 7 13s-2.5-2-2.5-4.5S5.3 4 7 4zM17 10c1.7 0 2.5 2 2.5 4.5S18.5 19 17 19s-2.5-2-2.5-4.5S15.3 10 17 10z" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></>,
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  check: <path d="M20 6 9 17l-5-5" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  users: <><circle cx="9" cy="8" r="4" /><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7M16 4.1a4 4 0 0 1 0 7.8M18 14.5c2.4.9 4 3.3 4 6.5" /></>,
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  leaf: <><path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15" /><path d="M5 19c3-4 6-6 10-8" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5a3 3 0 0 0 3.5 3.5M16 6h3.5A3 3 0 0 1 16 9.5M12 13v4M8 21h8M9 17h6" /></>,
  tag: <><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.5" /></>,
  heart: <path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  pen: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13 7 4 4" /></>,
  touch: <><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V12m0-1a1.5 1.5 0 0 1 3 0v4a6 6 0 0 1-6 6h-.5a6 6 0 0 1-5-2.7L4 15.5a1.6 1.6 0 0 1 2.6-1.8L9 16" /></>,
};

export type KioskIconName = keyof typeof PATHS;

export function KIcon({ name, className = "h-6 w-6" }: { name: KioskIconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {PATHS[name]}
    </svg>
  );
}

/** Pastille ronde à la couleur du commerce, avec une icône. */
export function KBadge({ name, size = "md" }: { name: KioskIconName; size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-14 w-14" : "h-11 w-11";
  const icon = size === "lg" ? "h-7 w-7" : "h-5 w-5";
  return (
    <span className={`flex ${box} shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand`}>
      <KIcon name={name} className={icon} />
    </span>
  );
}
