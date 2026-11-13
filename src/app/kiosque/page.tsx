"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, contrastTriple, errorMessage, hexToRgbTriple, NetworkError } from "@/lib/api";
import { CodeDots, Keypad } from "@/components/Keypad";
import { LegalText, Modal } from "@/components/Modal";
import { Wheel } from "@/components/Wheel";

// ---------------------------------------------------------------------------
// Types renvoyés par l'API
// ---------------------------------------------------------------------------
interface KioskConfig {
  productName: string;
  merchant: { name: string; logoUrl: string | null; primaryColor: string | null };
  rules: { identificationMode: "PIN" | "STAFF_VALIDATION"; kioskResetSeconds: number; wheelEnabled: boolean; earnMode: string; pointsPerEuro: number; pointsPerVisit: number };
  legal: Record<"TERMS" | "PRIVACY_POLICY" | "MARKETING_SMS" | "MARKETING_EMAIL", { version: string; content: string }>;
}
interface CustomerView {
  firstName: string | null;
  balance: number;
  tier: { name: string; bonusPercent: number } | null;
  nextTier: { name: string; minPoints: number } | null;
  availableRewards: { id: string; name: string; pointsCost: number }[];
  nextReward: { name: string; pointsCost: number; missing: number } | null;
}
interface SessionView {
  sessionId: string;
  status: "AWAITING_AUTH" | "IDENTIFIED" | "COMPLETED" | "EXPIRED" | "CANCELED";
  customer: CustomerView | null;
  purchase: { earned: number; bonus: number } | null;
  wheel: { available: boolean; prizes: { id: string; label: string }[]; lastPrize: string | null } | null;
}

type Screen = "loading" | "pair" | "home" | "pin" | "staff" | "enroll" | "verify" | "choosePin" | "identified" | "result" | "wheel";

const TOKEN_KEY = "kiosk_device_token";
const CONFIG_KEY = "kiosk_config";
const IDLE_SECONDS = 60; // saisie abandonnée
const IDENTIFIED_SECONDS = 120; // client identifié qui ne passe pas en caisse

const formatPhone = (d: string) => d.replace(/(\d{4})(\d{0,2})(\d{0,2})(\d{0,2})/, (_, a, b, c, e) => [a, b, c, e].filter(Boolean).join(" "));

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
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [enroll, setEnroll] = useState({ firstName: "", acceptTerms: false, confirmAge16: false, marketingSms: false });
  const [legalModal, setLegalModal] = useState<null | "TERMS" | "PRIVACY_POLICY">(null);
  const [wheelTarget, setWheelTarget] = useState<number | null>(null);
  const [prize, setPrize] = useState<{ label: string; type: string } | null>(null);
  const [pairCode, setPairCode] = useState("");

  const lastActivity = useRef(Date.now());
  const touch = () => (lastActivity.current = Date.now());

  // ---------------------------------------------------------------------------
  // Initialisation : jeton de l'appareil + configuration du commerce
  // ---------------------------------------------------------------------------
  const loadConfig = useCallback(async (t: string) => {
    try {
      const c = await api<KioskConfig>("/api/v1/kiosk/config", { token: t });
      setConfig(c);
      try { localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); } catch {}
      setScreen("home");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setScreen("pair");
      } else {
        const cached = localStorage.getItem(CONFIG_KEY);
        if (cached) setConfig(JSON.parse(cached));
        setScreen("home");
      }
    }
  }, []);

  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY);
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

  // Couleurs du commerce
  const rgb = hexToRgbTriple(config?.merchant.primaryColor);
  const brandStyle = rgb ? ({ "--brand": rgb, "--brand-contrast": contrastTriple(rgb) } as React.CSSProperties) : undefined;

  // ---------------------------------------------------------------------------
  // Remise à zéro : aucune donnée ne reste affichée
  // ---------------------------------------------------------------------------
  const reset = useCallback(
    (cancel = true) => {
      if (cancel && sessionId && token) api(`/api/v1/kiosk/sessions/${sessionId}`, { method: "DELETE", token }).catch(() => undefined);
      setPhone(""); setPin(""); setCode(""); setNewPin(""); setConfirmPin("");
      setSessionId(null); setView(null); setError(null); setPrize(null); setWheelTarget(null);
      setEnroll({ firstName: "", acceptTerms: false, confirmAge16: false, marketingSms: false });
      setLegalModal(null);
      setScreen("home");
      touch();
    },
    [sessionId, token],
  );

  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.code === "DEVICE_UNAUTHORIZED") {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setScreen("pair");
        return;
      }
      if (e instanceof ApiError && (e.code === "SESSION_EXPIRED" || e.status === 410 && e.code !== "CODE_EXPIRED")) {
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

  // Inactivité
  useEffect(() => {
    const timer = setInterval(() => {
      const idle = (Date.now() - lastActivity.current) / 1000;
      const resetAfter = config?.rules.kioskResetSeconds ?? 10;
      if ((screen === "result" && !view?.wheel?.available) || (screen === "wheel" && prize)) {
        if (idle > resetAfter) reset(false);
      } else if (screen === "identified") {
        if (idle > IDENTIFIED_SECONDS) reset();
      } else if (["pin", "staff", "enroll", "verify", "choosePin"].includes(screen) || (screen === "home" && phone)) {
        if (idle > IDLE_SECONDS) reset();
      } else if (screen === "result" && idle > IDLE_SECONDS) {
        reset(false);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [screen, config, reset, phone, prize, view]);

  // Suivi de la session (validation vendeur, achat encodé en caisse)
  useEffect(() => {
    if (!sessionId || !token || !["staff", "identified"].includes(screen)) return;
    let stop = false;
    const poll = async () => {
      try {
        const v = await api<SessionView>(`/api/v1/kiosk/sessions/${sessionId}`, { token });
        if (stop) return;
        setView(v);
        if (screen === "staff" && v.status === "IDENTIFIED") { setScreen("identified"); touch(); }
        if (v.status === "COMPLETED") { setScreen("result"); touch(); }
        if (v.status === "CANCELED" || v.status === "EXPIRED") reset(false);
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
      localStorage.setItem(TOKEN_KEY, r.token);
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
        if (e instanceof ApiError && e.code === "PIN_LOCKED") {
          setScreen("staff");
          throw e;
        }
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
  const shell = (content: React.ReactNode, opts: { back?: boolean } = {}) => (
    <main className="touch-ui flex min-h-screen flex-col bg-gradient-to-b from-white to-slate-100" style={brandStyle} onPointerDown={touch}>
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          {config?.merchant.logoUrl && <img src={config.merchant.logoUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />}
          <span className="text-xl font-bold">{merchantName}</span>
        </div>
        {opts.back && <button className="btn-ghost" onClick={() => reset()}>Annuler</button>}
      </header>
      {!online && <div className="bg-amber-100 px-6 py-2 text-center text-amber-900">Hors connexion — le vendeur peut ajouter vos points depuis la caisse.</div>}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-10">
        {error && <div className="w-full max-w-md rounded-xl bg-red-50 px-4 py-3 text-center text-lg text-red-800">{error}</div>}
        {content}
      </div>
      {legalModal && config && (
        <Modal title={legalModal === "TERMS" ? "Conditions du programme" : "Vos données personnelles"} onClose={() => setLegalModal(null)}>
          <LegalText content={config.legal[legalModal].content} />
          <p className="mt-6 text-xs text-slate-400">Version {config.legal[legalModal].version}</p>
        </Modal>
      )}
    </main>
  );

  switch (screen) {
    case "loading":
      return shell(<p className="text-slate-500">Chargement…</p>);

    case "pair":
      return shell(
        <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
          <h1 className="text-3xl font-bold">Appairer cette tablette</h1>
          <p className="text-slate-600">Saisissez le code d&apos;appairage fourni par l&apos;équipe {config?.productName ?? ""}.</p>
          <input className="input text-center font-mono text-3xl uppercase tracking-widest" value={pairCode} maxLength={9} autoFocus onChange={(e) => setPairCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX" />
          <button className="btn-dark w-full py-4 text-xl" disabled={busy || pairCode.replace("-", "").length < 8} onClick={submitPairing}>Appairer</button>
        </div>,
      );

    case "home":
      return shell(
        <div className="flex w-full max-w-md flex-col items-center gap-6">
          <div className="text-center">
            <h1 className="text-4xl font-bold">Cumulez vos points</h1>
            <p className="mt-2 text-xl text-slate-600">Tapez votre numéro de GSM</p>
          </div>
          <div className="h-16 w-full rounded-2xl bg-white text-center text-4xl font-semibold leading-[4rem] tracking-wider shadow-inner ring-1 ring-slate-200">
            {phone ? formatPhone(phone) : <span className="text-slate-300">04•• •• •• ••</span>}
          </div>
          <Keypad
            onDigit={(d) => setPhone((p) => (p.length < 13 ? p + d : p))}
            onDelete={() => setPhone((p) => p.slice(0, -1))}
            onSubmit={submitPhone}
            submitLabel="OK"
            submitDisabled={busy || phone.length < 9}
            extraKey={phone ? { label: "⌫", onPress: () => setPhone((p) => p.slice(0, -1)) } : { label: "+", onPress: () => setPhone("+") }}
          />
          <button className="text-base text-slate-500 underline" onClick={() => setLegalModal("PRIVACY_POLICY")}>Vos données personnelles</button>
        </div>,
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
          <button className="text-lg text-slate-600 underline" disabled={busy} onClick={requestCode}>Code oublié ? Recevoir un SMS</button>
        </div>,
        { back: true },
      );

    case "staff":
      return shell(
        <div className="max-w-md text-center">
          <div className="mb-6 text-6xl">🙋</div>
          <h1 className="text-3xl font-bold">Présentez-vous à la caisse</h1>
          <p className="mt-3 text-xl text-slate-600">Le vendeur va confirmer votre identité.</p>
        </div>,
        { back: true },
      );

    case "enroll": {
      const canSubmit = enroll.acceptTerms && enroll.confirmAge16 && !busy;
      const check = (key: keyof typeof enroll, label: React.ReactNode, required = false) => (
        <label className="flex cursor-pointer items-start gap-4 rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <input type="checkbox" className="mt-1 h-7 w-7 shrink-0 accent-[rgb(var(--brand))]" checked={enroll[key] as boolean} onChange={(e) => setEnroll((s) => ({ ...s, [key]: e.target.checked }))} />
          <span className="text-lg">{label}{required && <span className="text-red-600"> *</span>}</span>
        </label>
      );
      return shell(
        <div className="flex w-full max-w-xl flex-col gap-4">
          <h1 className="text-center text-3xl font-bold">Bienvenue ! Inscription en 30 secondes</h1>
          <p className="text-center text-lg text-slate-600">Numéro : <strong>{formatPhone(phone)}</strong></p>
          <div>
            <label className="label text-base">Prénom (facultatif)</label>
            <input className="input text-xl" value={enroll.firstName} maxLength={40} autoComplete="off" onChange={(e) => setEnroll((s) => ({ ...s, firstName: e.target.value }))} />
          </div>
          {check("acceptTerms", <>J&apos;accepte les <button type="button" className="underline" onClick={(e) => { e.preventDefault(); setLegalModal("TERMS"); }}>conditions du programme</button></>, true)}
          {check("confirmAge16", "J'ai 16 ans ou plus", true)}
          {check("marketingSms", <>J&apos;accepte de recevoir des offres par SMS <span className="text-slate-500">(facultatif, retirable à tout moment)</span></>)}
          <p className="text-sm text-slate-500">
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
          <button className="text-lg text-slate-600 underline" disabled={busy} onClick={requestCode}>Renvoyer le code</button>
        </div>,
        { back: true },
      );

    case "choosePin": {
      const confirming = newPin.length === 4;
      const value = confirming ? confirmPin : newPin;
      return shell(
        <div className="flex w-full max-w-md flex-col items-center gap-6">
          <h1 className="text-center text-3xl font-bold">{confirming ? "Confirmez votre code" : "Choisissez un code à 4 chiffres"}</h1>
          <p className="text-center text-lg text-slate-600">Il vous sera demandé à chaque passage.</p>
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
      return shell(
        c ? (
          <div className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
            <h1 className="text-4xl font-bold">Bonjour{c.firstName ? ` ${c.firstName}` : ""} !</h1>
            <div className="card w-full">
              <div className="text-7xl font-black text-brand">{c.balance}</div>
              <div className="text-xl text-slate-600">points</div>
              {c.tier && <div className="mt-3 inline-block rounded-full bg-slate-900 px-4 py-1 text-white">Niveau {c.tier.name}{c.tier.bonusPercent ? ` · +${c.tier.bonusPercent} %` : ""}</div>}
            </div>
            {c.availableRewards.length > 0 && (
              <div className="w-full rounded-2xl bg-emerald-50 p-4 text-lg text-emerald-900">🎁 Vous pouvez obtenir : <strong>{c.availableRewards.map((r) => r.name).join(", ")}</strong>. Demandez au vendeur !</div>
            )}
            {c.nextReward && (
              <div className="w-full">
                <div className="mb-2 text-lg">Encore <strong>{c.nextReward.missing} points</strong> pour : {c.nextReward.name}</div>
                <div className="h-4 w-full overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full bg-brand" style={{ width: `${Math.min(100, (c.balance / c.nextReward.pointsCost) * 100)}%` }} />
                </div>
              </div>
            )}
            <p className="text-xl text-slate-600">Présentez-vous à la caisse pour cumuler vos points.</p>
            <button className="btn-ghost px-8 py-4 text-lg" onClick={() => reset()}>Terminer</button>
          </div>
        ) : (
          <p>Chargement…</p>
        ),
      );
    }

    case "result": {
      const c = view?.customer;
      return shell(
        <div className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
          <div className="animate-pop text-8xl font-black text-brand">+{view?.purchase?.earned ?? 0}</div>
          <div className="text-2xl">points gagnés{view?.purchase?.bonus ? ` (dont ${view.purchase.bonus} de bonus ${c?.tier?.name ?? ""})` : ""}</div>
          <div className="card w-full text-2xl">Nouveau solde : <strong>{c?.balance ?? 0} points</strong></div>
          {view?.wheel?.available ? (
            <button className="btn-brand animate-pop px-10 py-6 text-2xl" onClick={spin} disabled={busy}>🎡 Tourner la roue</button>
          ) : (
            <p className="text-xl text-slate-600">Merci et à bientôt !</p>
          )}
          <button className="btn-ghost px-8 py-4 text-lg" onClick={() => reset(false)}>Terminer</button>
        </div>,
      );
    }

    case "wheel":
      return shell(
        <div className="flex flex-col items-center gap-6 text-center">
          <Wheel labels={(view?.wheel?.prizes ?? []).map((p) => p.label)} targetIndex={wheelTarget} onDone={touch} />
          {prize && wheelTarget !== null && <PrizeReveal prize={prize} />}
          <button className="btn-ghost px-8 py-4 text-lg" onClick={() => reset(false)}>Terminer</button>
        </div>,
      );
  }
}

function PrizeReveal({ prize }: { prize: { label: string; type: string } }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 4100);
    return () => clearTimeout(t);
  }, []);
  if (!shown) return <div className="h-16" />;
  return <div className="animate-pop text-4xl font-bold">{prize.type === "NOTHING" ? "Pas de chance cette fois !" : `🎉 ${prize.label}`}</div>;
}
