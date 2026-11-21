"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, contrastTriple, errorMessage, formatEuros, hexToRgbTriple, NetworkError } from "@/lib/api";
import { CodeDots, Keypad } from "@/components/Keypad";
import { LegalText, Modal } from "@/components/Modal";
import { Wheel } from "@/components/Wheel";
import { Confetti, CountUp, ProgressRing } from "@/components/Celebrate";
import { KBadge, KIcon, type KioskIconName } from "@/components/KioskIcon";
import { ReviewQr, StampCard } from "@/components/StampCard";

// ---------------------------------------------------------------------------
// Types renvoyés par l'API
// ---------------------------------------------------------------------------
interface HappyHour {
  active: { multiplierPercent: number; endMinute: number } | null;
  next: { multiplierPercent: number; dayOfWeek: number; startMinute: number; endMinute: number; inDays: number } | null;
}
interface KioskConfig {
  productName: string;
  merchant: {
    name: string; logoUrl: string | null; primaryColor: string | null; kioskMessage: string | null;
    kioskTitle: string | null; kioskTheme: "moderne" | "chaleureux" | "elegant" | "pop"; kioskBackground: string | null;
  };
  rules: { identificationMode: "PIN" | "STAFF_VALIDATION"; kioskResetSeconds: number; wheelEnabled: boolean; earnMode: "PER_EURO" | "PER_VISIT"; pointsPerEuro: number; pointsPerVisit: number };
  rewards: { name: string; pointsCost: number }[];
  stamps: { perStamp: number; total: number; rewardName: string } | null;
  review: { qrSvg: string } | null;
  happyHour: HappyHour;
  loyalty: { visitMilestone: { every: number; points: number } | null; streak: { weeks: number; points: number } | null; anniversaryPoints: number | null };
  legal: Record<"TERMS" | "PRIVACY_POLICY" | "MARKETING_SMS" | "MARKETING_EMAIL", { version: string; content: string }>;
}
interface CustomerView {
  firstName: string | null;
  balance: number;
  tier: { name: string; bonusPercent: number } | null;
  nextTier: { name: string; minPoints: number } | null;
  availableRewards: { id: string; name: string; pointsCost: number }[];
  nextReward: { name: string; pointsCost: number; missing: number } | null;
  offers: { id: string; title: string }[];
  engagement: {
    visits: number;
    streakWeeks: number;
    visitedThisWeek: boolean;
    streakGoal: { weeks: number; points: number } | null;
    nextMilestone: { inVisits: number; points: number; atVisit: number } | null;
  };
}
interface SessionView {
  sessionId: string;
  status: "AWAITING_AUTH" | "IDENTIFIED" | "COMPLETED" | "EXPIRED" | "CANCELED";
  customer: CustomerView | null;
  purchase: { earned: number; bonus: number; bonuses: { type: string; points: number }[] } | null;
  wheel: { available: boolean; prizes: { id: string; label: string }[]; lastPrize: string | null } | null;
}

type Screen =
  | "loading" | "pair" | "showcase" | "home" | "pin" | "staff" | "enroll" | "verify" | "choosePin" | "identified" | "result" | "wheel"
  | "vendorPin" | "vendor" | "prefs";

const TOKEN_KEY = "kiosk_device_token";
const CONFIG_KEY = "kiosk_config";
const IDLE_SECONDS = 60; // saisie abandonnée
const IDENTIFIED_SECONDS = 120; // client identifié qui ne passe pas en caisse
const SHOWCASE_AFTER_SECONDS = 30; // accueil inactif → vitrine
const SHOWCASE_SLIDE_SECONDS = 7;

const DAYS = ["", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const hhmm = (m: number) => `${Math.floor(m / 60)} h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`;
const multiplier = (p: number) => (p % 100 === 0 ? `×${p / 100}` : `+${p - 100} %`);
const formatPhone = (d: string) => d.replace(/(\d{4})(\d{0,2})(\d{0,2})(\d{0,2})/, (_, a, b, c, e) => [a, b, c, e].filter(Boolean).join(" "));

function earnText(r: KioskConfig["rules"]) {
  if (r.earnMode === "PER_VISIT") return `${r.pointsPerVisit} points à chaque passage`;
  const ppe = String(r.pointsPerEuro).replace(".", ",");
  return r.pointsPerEuro === 1 ? "1 point par euro dépensé" : `${ppe} points par euro dépensé`;
}

function happyHourText(h: HappyHour): string | null {
  if (h.active) return `Points ${multiplier(h.active.multiplierPercent)} jusqu'à ${hhmm(h.active.endMinute)}`;
  if (!h.next) return null;
  const when = h.next.inDays === 0 ? "aujourd'hui" : h.next.inDays === 1 ? "demain" : DAYS[h.next.dayOfWeek];
  return `Points ${multiplier(h.next.multiplierPercent)} ${when} de ${hhmm(h.next.startMinute)} à ${hhmm(h.next.endMinute)}`;
}

/** Libellé de chaque bonus affiché après l'achat. */
function bonusLabel(type: string, c: CustomerView | null): { icon: KioskIconName; text: string } {
  switch (type) {
    case "HAPPY_HOUR_BONUS": return { icon: "bolt", text: "Bonus heures creuses" };
    case "VISIT_MILESTONE_BONUS": return { icon: "sparkle", text: c ? `Votre ${c.engagement.visits}e visite` : "Visite fêtée" };
    case "STREAK_BONUS": return { icon: "flame", text: c ? `${c.engagement.streakWeeks} semaines d'affilée` : "Bonus régularité" };
    case "ANNIVERSARY_BONUS": return { icon: "cake", text: "Anniversaire de fidélité" };
    default: return { icon: "star", text: "Bonus" };
  }
}

export default function KioskPage() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [config, setConfig] = useState<KioskConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);

  const [phone, setPhone] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [view, setView] = useState<SessionView | null>(null);
  const [balanceBefore, setBalanceBefore] = useState<number | null>(null);
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [enroll, setEnroll] = useState({ firstName: "", acceptTerms: false, confirmAge16: false, marketingSms: false });
  const [legalModal, setLegalModal] = useState<null | "TERMS" | "PRIVACY_POLICY">(null);
  const [wheelTarget, setWheelTarget] = useState<number | null>(null);
  const [prize, setPrize] = useState<{ label: string; type: string } | null>(null);
  const [pairCode, setPairCode] = useState("");
  const [slide, setSlide] = useState(0);
  // Mode comptoir (vendeur sur la tablette) et préférences du client
  const [staff, setStaff] = useState<{ token: string; name: string } | null>(null);
  const [vendorIntent, setVendorIntent] = useState<"counter" | "validate">("counter");
  const [vendorPin, setVendorPin] = useState("");
  const [vendorAmount, setVendorAmount] = useState("");
  const [vendorKey, setVendorKey] = useState(() => Math.random().toString(36).slice(2) + Date.now());
  const [prefs, setPrefs] = useState<{ marketingSms: boolean } | null>(null);

  const lastActivity = useRef(Date.now());
  const touch = () => (lastActivity.current = Date.now());

  // ---------------------------------------------------------------------------
  // Initialisation : jeton de l'appareil + configuration du commerce
  // ---------------------------------------------------------------------------
  const loadConfig = useCallback(async (t: string, opts: { keepScreen?: boolean } = {}) => {
    try {
      const c = await api<KioskConfig>("/api/v1/kiosk/config", { token: t });
      setConfig(c);
      try { localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); } catch {}
      if (!opts.keepScreen) setScreen("home");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        try { localStorage.removeItem(TOKEN_KEY); } catch {}
        setToken(null);
        setScreen("pair");
      } else if (!opts.keepScreen) {
        try {
          const cached = localStorage.getItem(CONFIG_KEY);
          if (cached) setConfig(JSON.parse(cached));
        } catch {}
        setScreen("home");
      }
    }
  }, []);

  useEffect(() => {
    let t: string | null = null;
    try { t = localStorage.getItem(TOKEN_KEY); } catch {}
    setToken(t);
    if (t) loadConfig(t);
    else setScreen("pair");
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [loadConfig]);

  const rgb = hexToRgbTriple(config?.merchant.primaryColor) ?? "37 99 235";
  const theme = config?.merchant.kioskTheme ?? "moderne";
  const brandStyle = {
    "--brand": rgb,
    "--brand-contrast": contrastTriple(rgb),
    // Photo de fond du commerce, voilée pour garder le texte lisible
    ...(config?.merchant.kioskBackground
      ? { backgroundImage: `linear-gradient(var(--k-overlay), var(--k-overlay)), url(${config.merchant.kioskBackground})`, backgroundSize: "cover", backgroundPosition: "center" }
      : {}),
  } as React.CSSProperties;
  const brandHex = config?.merchant.primaryColor ?? "#2563eb";

  // ---------------------------------------------------------------------------
  // Remise à zéro : aucune donnée ne reste affichée
  // ---------------------------------------------------------------------------
  const reset = useCallback(
    (cancel = true) => {
      if (cancel && sessionId && token) api(`/api/v1/kiosk/sessions/${sessionId}`, { method: "DELETE", token }).catch(() => undefined);
      setPhone(""); setPin(""); setCode(""); setNewPin(""); setConfirmPin("");
      setSessionId(null); setView(null); setError(null); setPrize(null); setWheelTarget(null); setBalanceBefore(null);
      setStaff(null); setVendorPin(""); setVendorAmount(""); setPrefs(null);
      setEnroll({ firstName: "", acceptTerms: false, confirmAge16: false, marketingSms: false });
      setLegalModal(null);
      setScreen("home");
      touch();
      // Recharge l'apparence et les réglages du commerce (modifiés depuis le back-office)
      if (token) loadConfig(token);
    },
    [sessionId, token, loadConfig],
  );

  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.code === "DEVICE_UNAUTHORIZED") {
        try { localStorage.removeItem(TOKEN_KEY); } catch {}
        setToken(null);
        setScreen("pair");
        return;
      }
      if (e instanceof ApiError && (e.code === "SESSION_EXPIRED" || (e.status === 410 && e.code !== "CODE_EXPIRED"))) {
        reset(false);
        setError("Session expirée, recommencez.");
        return;
      }
      if (e instanceof NetworkError) {
        setError("Connexion internet indisponible. Donnez votre numéro au vendeur : vos points seront ajoutés depuis la caisse.");
        return;
      }
      setError(errorMessage(e));
    },
    [reset],
  );

  // Inactivité : vitrine, remise à zéro
  useEffect(() => {
    const timer = setInterval(() => {
      const idle = (Date.now() - lastActivity.current) / 1000;
      const resetAfter = config?.rules.kioskResetSeconds ?? 10;
      if (screen === "home" && !phone && !error && idle > SHOWCASE_AFTER_SECONDS) {
        setSlide(0);
        setScreen("showcase");
      } else if ((screen === "result" && !view?.wheel?.available) || (screen === "wheel" && prize)) {
        if (idle > resetAfter + 2) reset(false);
      } else if (screen === "identified") {
        if (idle > IDENTIFIED_SECONDS) reset();
      } else if (["pin", "staff", "enroll", "verify", "choosePin", "vendorPin", "vendor", "prefs"].includes(screen) || (screen === "home" && (phone || error))) {
        if (idle > IDLE_SECONDS) reset();
      } else if (screen === "result" && idle > IDLE_SECONDS) {
        reset(false);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [screen, config, reset, phone, prize, view, error]);

  // Vitrine : diaporama + rafraîchissement de la configuration toutes les 5 minutes
  useEffect(() => {
    if (screen !== "showcase") return;
    const s = setInterval(() => setSlide((n) => n + 1), SHOWCASE_SLIDE_SECONDS * 1000);
    const r = setInterval(() => token && loadConfig(token, { keepScreen: true }), 5 * 60_000);
    return () => { clearInterval(s); clearInterval(r); };
  }, [screen, token, loadConfig]);

  // Suivi de la session (validation vendeur, achat encodé en caisse)
  useEffect(() => {
    if (!sessionId || !token || !["staff", "identified"].includes(screen)) return;
    let stop = false;
    const poll = async () => {
      try {
        const v = await api<SessionView>(`/api/v1/kiosk/sessions/${sessionId}`, { token });
        if (stop) return;
        if (screen === "staff" && v.status === "IDENTIFIED") { setScreen("identified"); touch(); }
        if (v.status === "COMPLETED") { setScreen("result"); touch(); }
        if (v.status === "CANCELED" || v.status === "EXPIRED") return reset(false);
        setView((prev) => {
          if (v.status === "COMPLETED" && prev?.customer && prev.status !== "COMPLETED") setBalanceBefore(prev.customer.balance);
          return v;
        });
      } catch (e) {
        if (!(e instanceof NetworkError)) handleError(e);
      }
    };
    const t = setInterval(poll, 2000);
    poll();
    return () => { stop = true; clearInterval(t); };
  }, [sessionId, token, screen, reset, handleError]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    touch();
    try { await fn(); } catch (e) { handleError(e); } finally { setBusy(false); }
  };

  const loadView = async (id: string) => {
    const v = await api<SessionView>(`/api/v1/kiosk/sessions/${id}`, { token });
    setView(v);
    setScreen("identified");
  };

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const submitPairing = () =>
    run(async () => {
      const r = await api<{ token: string }>("/api/v1/devices/pair", { body: { code: pairCode } });
      try { localStorage.setItem(TOKEN_KEY, r.token); } catch {}
      setToken(r.token);
      setPairCode("");
      await loadConfig(r.token);
    });

  const submitPhone = () =>
    run(async () => {
      const r = await api<{ kind: "NEW" } | { kind: "KNOWN"; sessionId: string; authMethod: "PIN" | "STAFF_VALIDATION" }>("/api/v1/kiosk/sessions", { body: { phone }, token });
      if (r.kind === "NEW") return setScreen("enroll");
      setSessionId(r.sessionId);
      setScreen(r.authMethod === "PIN" ? "pin" : "staff");
    });

  const submitPin = (value: string) =>
    run(async () => {
      try {
        await api(`/api/v1/kiosk/sessions/${sessionId}/pin`, { body: { pin: value }, token });
        await loadView(sessionId!);
      } catch (e) {
        setPin("");
        if (e instanceof ApiError && e.code === "PIN_LOCKED") setScreen("staff");
        throw e;
      }
    });

  const requestCode = () =>
    run(async () => {
      await api(`/api/v1/kiosk/sessions/${sessionId}/forgot-pin`, { body: {}, token });
      setCode("");
      setScreen("verify");
    });

  const submitEnroll = () =>
    run(async () => {
      const r = await api<{ sessionId: string }>("/api/v1/kiosk/enroll", {
        body: { phone, firstName: enroll.firstName || null, acceptTerms: enroll.acceptTerms, confirmAge16: enroll.confirmAge16, marketingSms: enroll.marketingSms, marketingEmail: false },
        token,
      });
      setSessionId(r.sessionId);
      setCode("");
      setScreen("verify");
    });

  const usesPin = config?.rules.identificationMode === "PIN";

  const submitVerification = (smsCode: string, chosenPin: string | null) =>
    run(async () => {
      try {
        await api(`/api/v1/kiosk/sessions/${sessionId}/verify`, { body: { code: smsCode, pin: chosenPin }, token });
        await loadView(sessionId!);
      } catch (e) {
        if (e instanceof ApiError && (e.code === "WEAK_PIN" || e.code === "INVALID_PIN")) {
          setNewPin(""); setConfirmPin(""); setScreen("choosePin");
        } else if (e instanceof ApiError && (e.code === "CODE_INVALID" || e.code === "CODE_EXPIRED")) {
          setCode(""); setNewPin(""); setConfirmPin(""); setScreen("verify");
        }
        throw e;
      }
    });

  // ---------------------------------------------------------------------------
  // Mode comptoir : le vendeur encaisse sur la tablette avec son code vendeur
  // ---------------------------------------------------------------------------
  const openVendor = (intent: "counter" | "validate") => {
    setVendorIntent(intent);
    setVendorPin("");
    setError(null);
    touch();
    if (staff && intent === "counter") return setScreen("vendor");
    setScreen("vendorPin");
  };

  const staffCall = async <T,>(path: string, body: Record<string, unknown>) => {
    try {
      return await api<T>(`/api/v1/kiosk/sessions/${sessionId}/staff${path}`, { body: { ...body, token: staff?.token }, token });
    } catch (e) {
      if (e instanceof ApiError && e.code === "STAFF_TOKEN_INVALID") {
        setStaff(null);
        setVendorPin("");
        setScreen("vendorPin");
      }
      throw e;
    }
  };

  const submitVendorPin = (pin: string) =>
    run(async () => {
      try {
        const r = await api<{ token: string; staffName: string }>(`/api/v1/kiosk/sessions/${sessionId}/staff`, { body: { pin }, token });
        setStaff({ token: r.token, name: r.staffName });
        if (vendorIntent === "validate") {
          await api(`/api/v1/kiosk/sessions/${sessionId}/staff/validate`, { body: { token: r.token }, token });
          await loadView(sessionId!);
        } else {
          setVendorAmount("");
          setScreen("vendor");
        }
      } catch (e) {
        setVendorPin("");
        throw e;
      }
    });

  const vendorPurchase = () =>
    run(async () => {
      const before = view?.customer?.balance ?? 0;
      await staffCall("/purchase", { amountCents: Number(vendorAmount || "0"), idempotencyKey: vendorKey });
      setVendorKey(Math.random().toString(36).slice(2) + Date.now());
      const v = await api<SessionView>(`/api/v1/kiosk/sessions/${sessionId}`, { token });
      setBalanceBefore(before);
      setView(v);
      setScreen("result");
    });

  const vendorRedeem = (rewardId: string, name: string) =>
    run(async () => {
      await staffCall("/redeem", { rewardId });
      setView(await api<SessionView>(`/api/v1/kiosk/sessions/${sessionId}`, { token }));
      setError(null);
      setVendorNotice(`${name} remis au client`);
    });

  const vendorOffer = (offerId: string, title: string) =>
    run(async () => {
      await staffCall("/offer", { offerId });
      setView(await api<SessionView>(`/api/v1/kiosk/sessions/${sessionId}`, { token }));
      setVendorNotice(`Offre « ${title} » appliquée`);
    });

  const [vendorNotice, setVendorNotice] = useState<string | null>(null);

  // Préférences du client (offres par SMS)
  const openPrefs = () =>
    run(async () => {
      setPrefs(await api<{ marketingSms: boolean }>(`/api/v1/kiosk/sessions/${sessionId}/preferences`, { token }));
      setScreen("prefs");
    });

  const savePrefs = (marketingSms: boolean) =>
    run(async () => {
      setPrefs(await api<{ marketingSms: boolean }>(`/api/v1/kiosk/sessions/${sessionId}/preferences`, { body: { marketingSms }, token }));
    });

  const spin = () =>
    run(async () => {
      setScreen("wheel");
      const r = await api<{ prizeIndex: number; prize: { label: string; type: string } }>(`/api/v1/kiosk/sessions/${sessionId}/wheel`, { body: {}, token });
      setWheelTarget(r.prizeIndex);
      setPrize(r.prize);
    });

  // ---------------------------------------------------------------------------
  // Rendu
  // ---------------------------------------------------------------------------
  const merchantName = config?.merchant.name ?? "";
  const hhText = config ? happyHourText(config.happyHour) : null;

  const shell = (content: React.ReactNode, opts: { back?: boolean; wide?: boolean } = {}) => (
    <main className="touch-ui kiosk flex min-h-screen flex-col" data-theme={theme} style={brandStyle} onPointerDown={touch}>
      <header className="flex items-center justify-between gap-4 px-6 py-5 sm:px-10">
        <div className="flex items-center gap-3">
          {config?.merchant.logoUrl ? (
            <img src={config.merchant.logoUrl} alt="" className="h-12 w-12 rounded-xl k-card object-contain shadow-sm" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-xl font-black text-brand-contrast">{merchantName.slice(0, 1)}</div>
          )}
          <span className="text-2xl font-bold tracking-tight">{merchantName}</span>
        </div>
        <div className="flex items-center gap-3">
          {config?.happyHour.active && (
            <span className="animate-pulse-soft inline-flex items-center gap-2 rounded-full bg-amber-400 px-4 py-2 text-base font-bold text-slate-900"><KIcon name="bolt" className="h-5 w-5" /> {hhText}</span>
          )}
          {opts.back && <button className="btn-ghost" onClick={() => reset()}>Annuler</button>}
        </div>
      </header>
      {!online && <div className="bg-amber-100 px-6 py-2 text-center text-amber-900">Hors connexion — le vendeur peut ajouter vos points depuis la caisse.</div>}
      <div className={`mx-auto flex w-full flex-1 flex-col items-center justify-center gap-6 px-6 pb-10 ${opts.wide ? "max-w-6xl" : "max-w-3xl"}`}>
        {error && <div className="w-full max-w-md rounded-2xl bg-red-50 px-5 py-4 text-center text-lg text-red-800 ring-1 ring-red-100">{error}</div>}
        {content}
      </div>
      {legalModal && config && (
        <Modal title={legalModal === "TERMS" ? "Conditions du programme" : "Vos données personnelles"} onClose={() => setLegalModal(null)}>
          <LegalText content={config.legal[legalModal].content} />
          <p className="mt-6 text-xs k-muted opacity-70">Version {config.legal[legalModal].version}</p>
        </Modal>
      )}
    </main>
  );

  const perks = config
    ? [
        { icon: "bag" as KioskIconName, text: earnText(config.rules) },
        ...(config.loyalty.visitMilestone ? [{ icon: "sparkle" as KioskIconName, text: `+${config.loyalty.visitMilestone.points} points toutes les ${config.loyalty.visitMilestone.every} visites` }] : []),
        ...(config.loyalty.streak ? [{ icon: "flame" as KioskIconName, text: `+${config.loyalty.streak.points} points après ${config.loyalty.streak.weeks} semaines d'affilée` }] : []),
        ...(hhText && !config.happyHour.active ? [{ icon: "bolt" as KioskIconName, text: hhText }] : []),
        ...(config.loyalty.anniversaryPoints ? [{ icon: "cake" as KioskIconName, text: `Un cadeau pour votre anniversaire de fidélité` }] : []),
      ]
    : [];

  switch (screen) {
    case "loading":
      return shell(<p className="k-muted">Chargement…</p>);

    case "pair":
      return shell(
        <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
          <h1 className="text-3xl font-bold">Appairer cette tablette</h1>
          <p className="k-muted">Saisissez le code d&apos;appairage fourni par l&apos;équipe {config?.productName ?? ""}.</p>
          <input className="input text-center font-mono text-3xl uppercase tracking-widest" value={pairCode} maxLength={9} autoFocus onChange={(e) => setPairCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX" />
          <button className="btn-dark w-full py-4 text-xl" disabled={busy || pairCode.replace("-", "").length < 8} onClick={submitPairing}>Appairer</button>
        </div>,
      );

    case "showcase":
      return <Showcase config={config} slide={slide} perks={perks} hhText={hhText} brandStyle={brandStyle} theme={theme} onWake={() => { touch(); setScreen("home"); }} />;

    case "home":
      return shell(
        <div className="grid w-full items-center gap-8 landscape:md:grid-cols-[1fr_minmax(0,420px)] landscape:md:gap-10">
          <div className="animate-fade-in space-y-6 text-center landscape:md:text-left">
            <div>
              <h1 className="text-5xl font-black leading-tight sm:text-6xl">{config?.merchant.kioskTitle || `Bienvenue chez ${merchantName}`}</h1>
              {!config?.merchant.kioskMessage && <p className="k-muted mt-4 text-2xl">Cumulez des points à chaque visite.</p>}
              {config?.merchant.kioskMessage && <p className="mt-4 text-2xl font-medium text-brand">{config.merchant.kioskMessage}</p>}
            </div>
            <div className="flex flex-wrap justify-center gap-2 landscape:md:hidden">
              {perks.slice(0, 4).map((p) => (
                <span key={p.text} className="k-card inline-flex items-center gap-2 rounded-full px-4 py-2 text-base"><KIcon name={p.icon} className="h-5 w-5 text-brand" /> {p.text}</span>
              ))}
            </div>
            <ul className="hidden space-y-3 landscape:md:block">
              {perks.slice(0, 4).map((p) => (
                <li key={p.text} className="k-card flex items-center gap-4 rounded-2xl px-5 py-4 text-lg">
                  <KBadge name={p.icon} />
                  <span>{p.text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5 rounded-[2rem] k-card p-6 shadow-xl">
            <p className="text-xl font-semibold k-muted">Tapez votre numéro de GSM</p>
            <div className="h-16 w-full rounded-2xl k-card text-center text-4xl font-semibold leading-[4rem] tracking-wider">
              {phone ? formatPhone(phone) : <span className="k-muted opacity-40">04•• •• •• ••</span>}
            </div>
            <Keypad
              onDigit={(d) => setPhone((p) => (p.length < 13 ? p + d : p))}
              onDelete={() => setPhone((p) => p.slice(0, -1))}
              onSubmit={submitPhone}
              submitLabel="OK"
              submitDisabled={busy || phone.length < 9}
              extraKey={phone ? { label: "⌫", onPress: () => setPhone((p) => p.slice(0, -1)) } : { label: "+", onPress: () => setPhone("+") }}
            />
            <button className="text-base k-muted underline" onClick={() => setLegalModal("PRIVACY_POLICY")}>Vos données personnelles</button>
          </div>
        </div>,
        { wide: true },
      );

    case "pin":
      return shell(
        <div className="flex w-full max-w-md flex-col items-center gap-6">
          <h1 className="text-3xl font-bold">Votre code secret</h1>
          <CodeDots length={4} value={pin} />
          <Keypad
            onDigit={(d) => {
              const v = (pin + d).slice(0, 4);
              setPin(v);
              if (v.length === 4) submitPin(v);
            }}
            onDelete={() => setPin((p) => p.slice(0, -1))}
          />
          <button className="text-lg k-muted underline" disabled={busy} onClick={requestCode}>Code oublié ? Recevoir un SMS</button>
        </div>,
        { back: true },
      );

    case "staff":
      return shell(
        <div className="max-w-md text-center">
          <div className="mb-6 flex justify-center"><KBadge name="user" size="lg" /></div>
          <h1 className="text-3xl font-bold">Présentez-vous à la caisse</h1>
          <p className="mt-3 text-xl k-muted">Le vendeur va confirmer votre identité.</p>
          <button className="btn-ghost mt-8 px-6 py-3" onClick={() => openVendor("validate")}>Vendeur : confirmer ici avec votre code</button>
        </div>,
        { back: true },
      );

    case "enroll": {
      const canSubmit = enroll.acceptTerms && enroll.confirmAge16 && !busy;
      const check = (key: keyof typeof enroll, label: React.ReactNode, required = false) => (
        <label className="flex cursor-pointer items-start gap-4 rounded-2xl k-card p-4">
          <input type="checkbox" className="mt-1 h-7 w-7 shrink-0 accent-[rgb(var(--brand))]" checked={enroll[key] as boolean} onChange={(e) => setEnroll((s) => ({ ...s, [key]: e.target.checked }))} />
          <span className="text-lg">{label}{required && <span className="text-red-600"> *</span>}</span>
        </label>
      );
      return shell(
        <div className="flex w-full max-w-xl flex-col gap-4">
          <h1 className="text-center text-3xl font-bold">Bienvenue ! Inscription en 30 secondes</h1>
          <p className="text-center text-lg k-muted">Numéro : <strong>{formatPhone(phone)}</strong></p>
          <div>
            <label className="label text-base" htmlFor="firstName">Prénom (facultatif)</label>
            <input id="firstName" className="input text-xl" value={enroll.firstName} maxLength={40} autoComplete="off" onChange={(e) => setEnroll((s) => ({ ...s, firstName: e.target.value }))} />
          </div>
          {check("acceptTerms", <>J&apos;accepte les <button type="button" className="underline" onClick={(e) => { e.preventDefault(); setLegalModal("TERMS"); }}>conditions du programme</button></>, true)}
          {check("confirmAge16", "J'ai 16 ans ou plus", true)}
          {check("marketingSms", <>J&apos;accepte de recevoir des offres par SMS <span className="k-muted">(facultatif, retirable à tout moment)</span></>)}
          <p className="text-sm k-muted">
            {merchantName} utilise votre numéro uniquement pour gérer vos points.{" "}
            <button type="button" className="underline" onClick={() => setLegalModal("PRIVACY_POLICY")}>En savoir plus sur vos données</button>
          </p>
          <button className="btn-brand py-5 text-xl" disabled={!canSubmit} onClick={submitEnroll}>Recevoir mon code par SMS</button>
        </div>,
        { back: true },
      );
    }

    case "verify":
      return shell(
        <div className="flex w-full max-w-md flex-col items-center gap-6">
          <h1 className="text-center text-3xl font-bold">Code reçu par SMS</h1>
          <CodeDots length={6} value={code} />
          <Keypad
            onDigit={(d) => {
              const v = (code + d).slice(0, 6);
              setCode(v);
              if (v.length === 6) {
                if (usesPin) { setScreen("choosePin"); touch(); } else submitVerification(v, null);
              }
            }}
            onDelete={() => setCode((c) => c.slice(0, -1))}
          />
          <button className="text-lg k-muted underline" disabled={busy} onClick={requestCode}>Renvoyer le code</button>
        </div>,
        { back: true },
      );

    case "choosePin": {
      const confirming = newPin.length === 4;
      const value = confirming ? confirmPin : newPin;
      return shell(
        <div className="flex w-full max-w-md flex-col items-center gap-6">
          <h1 className="text-center text-3xl font-bold">{confirming ? "Confirmez votre code" : "Choisissez un code à 4 chiffres"}</h1>
          <p className="text-center text-lg k-muted">Il vous sera demandé à chaque passage.</p>
          <CodeDots length={4} value={value} />
          <Keypad
            onDigit={(d) => {
              if (!confirming) return setNewPin((p) => (p + d).slice(0, 4));
              const v = (confirmPin + d).slice(0, 4);
              setConfirmPin(v);
              if (v.length === 4) {
                if (v !== newPin) {
                  setError("Les deux codes sont différents, recommencez.");
                  setNewPin(""); setConfirmPin("");
                } else submitVerification(code, v);
              }
            }}
            onDelete={() => (confirming ? setConfirmPin((p) => p.slice(0, -1)) : setNewPin((p) => p.slice(0, -1)))}
          />
        </div>,
        { back: true },
      );
    }

    case "identified": {
      const c = view?.customer;
      if (!c) return shell(<p>Chargement…</p>);
      const target = c.nextReward?.pointsCost ?? c.availableRewards.at(-1)?.pointsCost ?? 0;
      const e = c.engagement;
      const chips = [
        ...(e.streakWeeks >= 2 ? [{ icon: "flame" as KioskIconName, text: `${e.streakWeeks} semaines d'affilée` }] : []),
        ...(e.streakGoal && e.streakWeeks > 0 && !e.visitedThisWeek && (e.streakWeeks + 1) % e.streakGoal.weeks === 0
          ? [{ icon: "gift" as KioskIconName, text: `Aujourd'hui : +${e.streakGoal.points} points de régularité` }]
          : []),
        ...(e.nextMilestone ? [{ icon: "sparkle" as KioskIconName, text: e.nextMilestone.inVisits === 1 ? `Votre prochaine visite : +${e.nextMilestone.points} points` : `Encore ${e.nextMilestone.inVisits} visites avant +${e.nextMilestone.points} points` }] : []),
        ...(e.visits > 0 ? [{ icon: "check" as KioskIconName, text: `${e.visits} visite${e.visits > 1 ? "s" : ""}` }] : []),
      ];
      return shell(
        <div className="grid w-full items-center gap-10 landscape:md:grid-cols-[auto_1fr]">
          <div className="animate-fade-in flex flex-col items-center gap-4">
            {config?.stamps ? (
              <div className="w-full max-w-md">
                <StampCard filled={Math.floor(c.balance / config.stamps.perStamp)} total={config.stamps.total} rewardName={config.stamps.rewardName} />
              </div>
            ) : (
              <ProgressRing value={target ? c.balance / target : 1} size={280} stroke={20}>
                <CountUp to={c.balance} className="text-7xl font-black tabular-nums" />
                <span className="text-xl k-muted">points</span>
              </ProgressRing>
            )}
            {c.tier && <span className="rounded-full bg-slate-900 px-5 py-2 text-lg font-semibold text-white">Niveau {c.tier.name}{c.tier.bonusPercent ? ` · +${c.tier.bonusPercent} %` : ""}</span>}
          </div>
          <div className="animate-fade-in space-y-5 text-center landscape:md:text-left">
            <h1 className="text-5xl font-black tracking-tight">Bonjour{c.firstName ? ` ${c.firstName}` : ""} !</h1>
            {c.offers.map((o) => (
              <div key={o.id} className="animate-pop flex items-center gap-3 rounded-2xl bg-amber-400 px-5 py-4 text-2xl font-bold text-slate-900 shadow-lg"><KIcon name="gift" className="h-7 w-7" /> Votre offre : {o.title}</div>
            ))}
            {c.availableRewards.length > 0 ? (
              <div className="rounded-2xl bg-emerald-50 px-5 py-4 text-xl text-emerald-900 ring-1 ring-emerald-100">
                Vous pouvez obtenir : <strong>{c.availableRewards.map((r) => r.name).join(", ")}</strong>. Demandez au vendeur !
              </div>
            ) : null}
            {c.nextReward && !config?.stamps && (
              <p className="text-2xl">Encore <strong className="text-brand">{c.nextReward.missing} points</strong> pour : {c.nextReward.name}</p>
            )}
            {chips.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 landscape:md:justify-start">
                {chips.map((x) => <span key={x.text} className="k-card inline-flex items-center gap-2 rounded-full px-4 py-2 text-lg"><KIcon name={x.icon} className="h-5 w-5 text-brand" /> {x.text}</span>)}
              </div>
            )}
            <p className="text-xl k-muted">Présentez-vous à la caisse pour cumuler vos points.</p>
            <div className="flex flex-wrap items-center justify-center gap-3 landscape:md:justify-start">
              <button className="btn-ghost px-8 py-4 text-lg" onClick={() => reset()}>Terminer</button>
              <button className="k-muted px-4 py-4 text-base underline" onClick={openPrefs}>Mes préférences</button>
              <button className="k-muted px-4 py-4 text-base underline" onClick={() => openVendor("counter")}>Espace vendeur</button>
            </div>
          </div>
        </div>,
        { wide: true },
      );
    }

    case "vendorPin":
      return shell(
        <div className="flex w-full max-w-md flex-col items-center gap-6">
          <div className="flex justify-center"><KBadge name="lock" size="lg" /></div>
          <h1 className="text-center text-3xl font-bold">Code vendeur</h1>
          <p className="k-muted text-center text-lg">{vendorIntent === "validate" ? "Confirmez l'identité du client." : "Pour encaisser sur la tablette."}</p>
          <CodeDots length={Math.max(4, vendorPin.length)} value={vendorPin} />
          <Keypad
            onDigit={(d) => setVendorPin((p) => (p.length < 6 ? p + d : p))}
            onDelete={() => setVendorPin((p) => p.slice(0, -1))}
            onSubmit={() => submitVendorPin(vendorPin)}
            submitLabel="OK"
            submitDisabled={busy || vendorPin.length < 4}
          />
          <button className="k-muted text-lg underline" onClick={() => setScreen(vendorIntent === "validate" ? "staff" : "identified")}>Retour</button>
        </div>,
      );

    case "vendor": {
      const c = view?.customer;
      if (!c) return shell(<p>Chargement…</p>);
      const cents = Number(vendorAmount || "0");
      return shell(
        <div className="grid w-full gap-8 landscape:md:grid-cols-[minmax(0,420px)_1fr]">
          <div className="k-card mx-auto flex w-full max-w-md flex-col items-center gap-4 rounded-[2rem] p-6 shadow-xl">
            <p className="k-muted text-lg">Montant de l&apos;achat</p>
            <div className="text-5xl font-bold tabular-nums">{formatEuros(cents)}</div>
            <Keypad
              onDigit={(d) => setVendorAmount((a) => (a.length < 7 ? (a + d).replace(/^0+/, "") : a))}
              onDelete={() => setVendorAmount((a) => a.slice(0, -1))}
              onSubmit={vendorPurchase}
              submitLabel="Valider"
              submitDisabled={busy || view?.status !== "IDENTIFIED"}
            />
          </div>
          <div className="space-y-4">
            <div>
              <p className="k-muted">Vendeur : {staff?.name}</p>
              <h1 className="text-4xl font-bold">{c.firstName ?? "Client"} · {c.balance} points</h1>
            </div>
            {vendorNotice && <div className="rounded-2xl bg-emerald-50 px-5 py-3 text-lg text-emerald-900">{vendorNotice}</div>}
            {c.offers.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-3 rounded-2xl bg-amber-400 px-5 py-4 text-slate-900">
                <span className="text-xl font-semibold">Offre SMS : {o.title}</span>
                <button className="btn-dark" disabled={busy} onClick={() => vendorOffer(o.id, o.title)}>Appliquer</button>
              </div>
            ))}
            {c.availableRewards.length > 0 ? (
              <div className="k-card space-y-3 rounded-2xl p-5">
                <p className="text-lg font-semibold">Récompenses disponibles</p>
                {c.availableRewards.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3">
                    <span className="text-lg">{r.name} <span className="k-muted">· {r.pointsCost} points</span></span>
                    <button className="btn-brand" disabled={busy} onClick={() => vendorRedeem(r.id, r.name)}>Remettre</button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="k-muted text-lg">Pas encore assez de points pour une récompense.</p>
            )}
            <button className="btn-ghost px-8 py-4 text-lg" onClick={() => { setVendorNotice(null); setScreen("identified"); }}>Fermer l&apos;espace vendeur</button>
          </div>
        </div>,
        { wide: true },
      );
    }

    case "prefs":
      return shell(
        <div className="flex w-full max-w-xl flex-col gap-5">
          <h1 className="text-center text-3xl font-bold">Mes préférences</h1>
          <label className="k-card flex cursor-pointer items-center justify-between gap-6 rounded-2xl p-6">
            <span>
              <span className="block text-xl font-semibold">Recevoir les offres par SMS</span>
              <span className="k-muted block">Promotions et petits cadeaux de {merchantName}. Au maximum quelques SMS par mois.</span>
            </span>
            <input type="checkbox" className="h-9 w-9 shrink-0 accent-[rgb(var(--brand))]" checked={!!prefs?.marketingSms} disabled={busy} onChange={(e) => savePrefs(e.target.checked)} />
          </label>
          <p className="k-muted text-center">Vous pouvez aussi demander au vendeur de supprimer votre compte à tout moment.</p>
          <button className="btn-ghost px-8 py-4 text-lg" onClick={() => setScreen("identified")}>Retour</button>
        </div>,
      );

    case "result": {
      const c = view?.customer;
      const p = view?.purchase;
      const lines = [
        ...(p && p.bonus > 0 ? [{ icon: "star" as KioskIconName, text: `Bonus niveau ${c?.tier?.name ?? ""}`, points: p.bonus }] : []),
        ...(p?.bonuses ?? []).map((b) => ({ ...bonusLabel(b.type, c ?? null), points: b.points })),
      ];
      return shell(
        <div className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
          <Confetti color={brandHex} pieces={lines.length ? 220 : 120} />
          <div className="animate-pop text-9xl font-black tabular-nums text-brand">+<CountUp to={p?.earned ?? 0} duration={900} /></div>
          <div className="text-3xl font-semibold">points gagnés !</div>
          {lines.length > 0 && (
            <ul className="w-full space-y-2">
              {lines.map((l, i) => (
                <li key={i} className="animate-fade-in flex items-center justify-between rounded-2xl k-card px-5 py-3 text-xl shadow-sm" style={{ animationDelay: `${0.4 + i * 0.25}s` }}>
                  <span className="flex items-center gap-3"><KIcon name={l.icon} className="h-6 w-6 text-brand" /> {l.text}</span>
                  <strong className="text-brand">+{l.points}</strong>
                </li>
              ))}
            </ul>
          )}
          {config?.stamps && c ? (
            <StampCard
              filled={Math.floor(c.balance / config.stamps.perStamp)}
              total={config.stamps.total}
              rewardName={config.stamps.rewardName}
              fresh={Math.max(0, Math.floor(c.balance / config.stamps.perStamp) - Math.floor((balanceBefore ?? c.balance) / config.stamps.perStamp))}
            />
          ) : (
            <div className="w-full rounded-2xl k-card px-6 py-5 text-2xl shadow-sm">
              Nouveau solde : <strong><CountUp from={balanceBefore ?? 0} to={c?.balance ?? 0} duration={1500} /> points</strong>
            </div>
          )}
          {config?.review && c && c.engagement.visits >= 3 && <ReviewQr svg={config.review.qrSvg} merchantName={merchantName} />}
          {view?.wheel?.available ? (
            <button className="btn-brand animate-pop px-10 py-6 text-2xl" onClick={spin} disabled={busy}>Tourner la roue</button>
          ) : (
            <p className="text-xl k-muted">Merci et à bientôt !</p>
          )}
          <button className="btn-ghost px-8 py-4 text-lg" onClick={() => reset(false)}>Terminer</button>
        </div>,
      );
    }

    case "wheel":
      return shell(
        <div className="flex flex-col items-center gap-6 text-center">
          <Wheel labels={(view?.wheel?.prizes ?? []).map((p) => p.label)} targetIndex={wheelTarget} onDone={touch} />
          {prize && wheelTarget !== null && <PrizeReveal prize={prize} color={brandHex} />}
          <button className="btn-ghost px-8 py-4 text-lg" onClick={() => reset(false)}>Terminer</button>
        </div>,
      );
  }
}

function PrizeReveal({ prize, color }: { prize: { label: string; type: string }; color: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 4100);
    return () => clearTimeout(t);
  }, []);
  if (!shown) return <div className="h-16" />;
  const won = prize.type !== "NOTHING";
  return (
    <>
      {won && <Confetti color={color} />}
      <div className="animate-pop text-4xl font-bold">{won ? `Gagné : ${prize.label}` : "Pas de chance cette fois !"}</div>
      {prize.type === "REWARD" && <p className="text-xl k-muted">Le vendeur vous le remet tout de suite.</p>}
    </>
  );
}

/** Vitrine : la tablette en veille présente le programme et attire l'œil. */
function Showcase({ config, slide, perks, hhText, brandStyle, theme, onWake }: {
  theme: string;
  config: KioskConfig | null;
  slide: number;
  perks: { icon: KioskIconName; text: string }[];
  hhText: string | null;
  brandStyle: React.CSSProperties;
  onWake: () => void;
}) {
  const slides: React.ReactNode[] = [];
  if (config?.merchant.kioskMessage) {
    slides.push(<p className="max-w-4xl text-6xl font-black leading-tight tracking-tight">{config.merchant.kioskMessage}</p>);
  }
  if (config?.rewards.length) {
    slides.push(
      <div className="w-full max-w-5xl space-y-8">
        <p className="text-5xl font-black tracking-tight">Ce que vous pouvez gagner</p>
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
          {config.rewards.map((r) => (
            <div key={r.name} className="rounded-3xl k-card px-6 py-8 shadow-lg">
              <div className="text-3xl font-bold">{r.name}</div>
              <div className="mt-2 text-2xl font-semibold text-brand">{r.pointsCost} points</div>
            </div>
          ))}
        </div>
      </div>,
    );
  }
  if (hhText) {
    slides.push(
      <div className="space-y-6">
        <div className="flex justify-center"><span className="flex h-28 w-28 items-center justify-center rounded-full bg-brand text-brand-contrast"><KIcon name="bolt" className="h-14 w-14" /></span></div>
        <p className="text-6xl font-black tracking-tight">{hhText}</p>
        {config?.happyHour.active && <p className="text-3xl k-muted">C&apos;est maintenant !</p>}
      </div>,
    );
  }
  if (perks.length) {
    slides.push(
      <div className="w-full max-w-3xl space-y-8">
        <p className="text-5xl font-black tracking-tight">Ici, la fidélité est récompensée</p>
        <ul className="space-y-4 text-left">
          {perks.map((p) => (
            <li key={p.text} className="flex items-center gap-5 rounded-3xl k-card px-7 py-5 text-3xl shadow-lg">
              <KBadge name={p.icon} size="lg" />
              <span>{p.text}</span>
            </li>
          ))}
        </ul>
      </div>,
    );
  }
  slides.push(
    <div className="space-y-6">
      <p className="text-6xl font-black tracking-tight">Pas encore inscrit ?</p>
      <p className="text-4xl k-muted">Votre numéro de GSM suffit. 30 secondes, c&apos;est gratuit.</p>
    </div>,
  );
  const current = slides[slide % slides.length];

  return (
    <main className="touch-ui kiosk flex min-h-screen cursor-pointer flex-col items-center justify-between p-10 text-center" data-theme={theme} style={brandStyle} onPointerDown={onWake}>
      <div className="flex items-center gap-4">
        {config?.merchant.logoUrl ? (
          <img src={config.merchant.logoUrl} alt="" className="h-16 w-16 rounded-2xl k-card object-contain shadow" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-3xl font-black text-brand-contrast">{config?.merchant.name.slice(0, 1)}</div>
        )}
        <span className="text-4xl font-bold tracking-tight">{config?.merchant.name}</span>
      </div>
      <div key={slide} className="animate-fade-in flex w-full flex-1 flex-col items-center justify-center">{current}</div>
      <div className="space-y-4">
        <div className="flex justify-center gap-2">
          {slides.map((_, i) => <span key={i} className={`h-2 rounded-full transition-all ${i === slide % slides.length ? "w-8 bg-brand" : "w-2 bg-slate-300"}`} />)}
        </div>
        <p className="animate-pulse-soft rounded-full bg-brand px-10 py-5 text-3xl font-bold text-brand-contrast shadow-lg"><span className="inline-flex items-center gap-3"><KIcon name="touch" className="h-8 w-8" /> Touchez l&apos;écran pour cumuler vos points</span></p>
      </div>
    </main>
  );
}
