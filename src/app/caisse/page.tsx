"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage, formatDate, formatEuros, NetworkError } from "@/lib/api";
import { signOut, useSession } from "@/lib/use-session";
import { WrongAccount } from "@/components/WrongAccount";
import { enqueuePurchase, flushQueue, listQueued, newIdempotencyKey } from "@/lib/offline-queue";
import { Keypad } from "@/components/Keypad";
import { Modal } from "@/components/Modal";

interface Summary {
  id: string;
  firstName: string | null;
  maskedPhone: string | null;
  balance: number;
  tier: { name: string; bonusPercent: number } | null;
  availableRewards: { id: string; name: string; pointsCost: number }[];
  nextReward: { name: string; missing: number } | null;
  pinLocked: boolean;
}
interface ActiveSession {
  sessionId: string;
  status: "AWAITING_AUTH" | "IDENTIFIED";
  authMethod: "PIN" | "STAFF_VALIDATION" | null;
  deviceName: string;
  customer: Summary;
}
interface Detail extends Summary {
  offers: { id: string; title: string; validUntil: string }[];
  wheelToday: { label: string; isReward: boolean } | null;
  consents: Record<string, boolean>;
  history: { id: string; type: string; points: number; purchaseAmountCents: number | null; reason: string | null; occurredAt: string; staff: string | null }[];
  redemptions: { id: string; reward: string; createdAt: string; canceledAt: string | null }[];
}
interface Reward { id: string; name: string; pointsCost: number; stock: number | null }

const TYPE_LABEL: Record<string, string> = {
  EARN: "Achat", TIER_BONUS: "Bonus niveau", WHEEL_BONUS: "Roue", REDEEM: "Récompense", ADJUSTMENT: "Correction", EXPIRATION: "Expiration", REVERSAL: "Annulation",
  HAPPY_HOUR_BONUS: "Bonus heures creuses", VISIT_MILESTONE_BONUS: "Bonus visite", STREAK_BONUS: "Bonus régularité", ANNIVERSARY_BONUS: "Anniversaire de fidélité",
};
const BONUS_LABEL: Record<string, string> = {
  HAPPY_HOUR_BONUS: "heures creuses", VISIT_MILESTONE_BONUS: "visite fêtée", STREAK_BONUS: "régularité", ANNIVERSARY_BONUS: "anniversaire",
};

/** Petit signal sonore discret quand un client arrive (bloqué par le navigateur tant qu'on n'a pas touché la page). */
function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.26);
  } catch {
    /* pas de son disponible */
  }
}

export default function CaissePage() {
  const { me, wrongAccount } = useSession(["OWNER", "STAFF"], "/caisse");
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [selected, setSelected] = useState<{ customerId: string; sessionId: string | null } | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [amount, setAmount] = useState("");
  const [idemKey, setIdemKey] = useState(newIdempotencyKey);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{ kind: "ok" | "err" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(0);
  const [online, setOnline] = useState(true);
  const [modal, setModal] = useState<null | "adjust" | "erase" | "rectify" | "takeover">(null);
  const [arrived, setArrived] = useState<string | null>(null);
  const [happyHour, setHappyHour] = useState<{ multiplierPercent: number; endMinute: number } | null>(null);

  const flash = (kind: "ok" | "err" | "warn", text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 5000);
  };

  // Ouverture directe d'une fiche depuis le back-office : /caisse?client=<id>
  useEffect(() => {
    if (!me) return;
    const id = new URLSearchParams(window.location.search).get("client");
    if (id && /^[0-9a-f-]{36}$/i.test(id)) setSelected({ customerId: id, sessionId: null });
  }, [me]);

  // Passages en cours à la tablette
  useEffect(() => {
    if (!me) return;
    const poll = () => api<ActiveSession[]>("/api/v1/pos/sessions").then(onSessions).catch(() => undefined);
    poll();
    const t = setInterval(poll, 2000);
    api<Reward[]>("/api/v1/pos/rewards").then(setRewards).catch(() => undefined);
    const status = () => api<{ happyHour: { active: { multiplierPercent: number; endMinute: number } | null } }>("/api/v1/pos/status").then((s) => setHappyHour(s.happyHour.active)).catch(() => undefined);
    status();
    const st = setInterval(status, 60_000);
    return () => { clearInterval(t); clearInterval(st); };
  }, [me]);

  // File hors-ligne
  const sync = useCallback(async () => {
    try {
      const r = await flushQueue();
      setQueued(r.remaining);
      for (const f of r.failed) flash("err", `Achat hors-ligne refusé (${f.item.customerLabel}) : ${f.message}`);
    } catch {
      /* IndexedDB indisponible */
    }
  }, []);
  useEffect(() => {
    if (!me) return;
    listQueued().then((q) => setQueued(q.length)).catch(() => undefined);
    const on = () => { setOnline(true); sync(); };
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const t = setInterval(sync, 30_000);
    sync();
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); clearInterval(t); };
  }, [me, sync]);

  const loadDetail = useCallback(async (customerId: string) => {
    try {
      setDetail(await api<Detail>(`/api/v1/pos/customers/${customerId}`));
    } catch (e) {
      flash("err", errorMessage(e));
    }
  }, []);

  useEffect(() => {
    if (selected) loadDetail(selected.customerId);
    else setDetail(null);
  }, [selected, loadDetail]);

  // Ouverture automatique : quand un client s'identifie sur la tablette, sa fiche s'ouvre ici,
  // sauf si le vendeur est en train de saisir un montant pour un autre client.
  const seen = useRef<Set<string>>(new Set());
  const busyRef = useRef({ selected, amount });
  busyRef.current = { selected, amount };
  const onSessions = (list: ActiveSession[]) => {
    setSessions(list);
    const fresh = list.filter((s) => (s.status === "IDENTIFIED" || s.authMethod === "STAFF_VALIDATION") && !seen.current.has(`${s.sessionId}:${s.status}`));
    for (const s of list) seen.current.add(`${s.sessionId}:${s.status}`);
    const next = fresh[0];
    if (!next) return;
    const { selected: cur, amount: typing } = busyRef.current;
    if (cur && typing && cur.customerId !== next.customer.id) return;
    selectSession(next);
    setArrived(next.sessionId);
    beep();
    setTimeout(() => setArrived((a) => (a === next.sessionId ? null : a)), 4000);
  };

  const selectSession = (s: ActiveSession) => {
    setSelected({ customerId: s.customer.id, sessionId: s.status === "IDENTIFIED" ? s.sessionId : null });
    setAmount("");
    setIdemKey(newIdempotencyKey());
  };

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { flash("err", errorMessage(e)); } finally { setBusy(false); }
  };

  const validateIdentity = (s: ActiveSession) =>
    act(async () => {
      await api(`/api/v1/pos/sessions/${s.sessionId}/validate`, { body: {} });
      setSelected({ customerId: s.customer.id, sessionId: s.sessionId });
      flash("ok", "Identité confirmée");
    });

  const doSearch = () =>
    act(async () => {
      const r = await api<{ customer: Summary | null }>(`/api/v1/pos/customers?phone=${encodeURIComponent(search)}`);
      if (!r.customer) return flash("warn", "Aucun client avec ce numéro. Il peut s'inscrire sur la tablette.");
      setSelected({ customerId: r.customer.id, sessionId: null });
      setSearch("");
    });

  const amountCents = Number(amount || "0");
  const label = detail ? detail.firstName ?? detail.maskedPhone ?? "client" : "client";

  const submitPurchase = () =>
    act(async () => {
      if (!selected) return;
      const body = { customerId: selected.customerId, amountCents, kioskSessionId: selected.sessionId, idempotencyKey: idemKey, occurredAt: new Date().toISOString() };
      try {
        const r = await api<{ earned: number; balance: number; capped: boolean; bonusPoints: number; bonuses: { type: string; points: number }[] }>("/api/v1/pos/purchases", { body });
        const extra = r.bonusPoints + r.bonuses.reduce((s, b) => s + b.points, 0);
        const names = [...(r.bonusPoints ? ["niveau"] : []), ...r.bonuses.map((b) => BONUS_LABEL[b.type] ?? "bonus")];
        flash(r.capped ? "warn" : "ok", `+${r.earned} points pour ${label} (solde ${r.balance})${extra ? ` dont ${extra} de bonus : ${names.join(", ")}` : ""}${r.capped ? " — plafond quotidien atteint" : ""}`);
        setSelected((s) => (s ? { ...s, sessionId: null } : s));
        await loadDetail(selected.customerId);
      } catch (e) {
        if (e instanceof NetworkError) {
          await enqueuePurchase({ ...body, customerLabel: label, kioskSessionId: null });
          setQueued((q) => q + 1);
          flash("warn", `Hors connexion : achat de ${formatEuros(amountCents)} enregistré, il sera envoyé automatiquement.`);
        } else throw e;
      }
      setAmount("");
      setIdemKey(newIdempotencyKey());
    });

  const redeem = (r: { id: string; name: string }) =>
    act(async () => {
      if (!selected || !confirm(`Remettre « ${r.name} » à ${label} ?`)) return;
      const res = await api<{ balance: number }>("/api/v1/pos/redemptions", { body: { customerId: selected.customerId, rewardId: r.id } });
      flash("ok", `${r.name} remis. Nouveau solde : ${res.balance} points`);
      await loadDetail(selected.customerId);
    });

  const optOut = () =>
    act(async () => {
      if (!selected || !confirm("Désinscrire ce client des SMS et e-mails marketing ?")) return;
      await api(`/api/v1/gdpr/customers/${selected.customerId}/marketing-opt-out`, { body: {} });
      flash("ok", "Client désinscrit du marketing");
      await loadDetail(selected.customerId);
    });

  if (wrongAccount) return <WrongAccount user={wrongAccount} pageName="La caisse" needed="aux vendeurs et propriétaires d'un commerce" next="/caisse" />;
  if (!me) return <main className="p-6 text-slate-500">Chargement…</main>;
  const isOwner = me.role === "OWNER";

  return (
    <main className="touch-ui min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 px-5 py-3 text-white">
        <div className="text-lg font-bold">{me.merchantName} — Caisse</div>
        <div className="flex items-center gap-4 text-sm">
          {happyHour && (
            <span className="rounded-full bg-amber-400 px-3 py-1 font-bold text-slate-900">
              ⚡ Heures creuses : points {happyHour.multiplierPercent % 100 === 0 ? `×${happyHour.multiplierPercent / 100}` : `+${happyHour.multiplierPercent - 100} %`} jusqu&apos;à {Math.floor(happyHour.endMinute / 60)} h{happyHour.endMinute % 60 ? String(happyHour.endMinute % 60).padStart(2, "0") : ""}
            </span>
          )}
          {!online && <span className="rounded-full bg-amber-400 px-3 py-1 font-semibold text-slate-900">Hors connexion</span>}
          {queued > 0 && <button className="rounded-full bg-amber-200 px-3 py-1 font-semibold text-slate-900" onClick={sync}>{queued} achat(s) à synchroniser</button>}
          {me.role === "OWNER" && <a href="/gestion" className="rounded-lg bg-white px-3 py-1.5 font-semibold text-slate-900">Gestion</a>}
          <span>{me.displayName}</span>
          <button className="underline" onClick={() => signOut()}>Déconnexion</button>
        </div>
      </header>

      {toast && (
        <div className={`fixed left-1/2 top-16 z-40 w-[90%] max-w-xl -translate-x-1/2 rounded-xl px-5 py-4 text-lg font-medium shadow-lg ${toast.kind === "ok" ? "bg-emerald-600 text-white" : toast.kind === "warn" ? "bg-amber-300 text-slate-900" : "bg-red-600 text-white"}`}>
          {toast.text}
        </div>
      )}

      <div className="grid gap-5 p-5 lg:grid-cols-[360px_1fr]">
        {/* Colonne gauche : tablette + recherche */}
        <section className="space-y-4">
          <div className="card space-y-3">
            <h2 className="text-lg font-semibold">À la tablette</h2>
            {sessions.length === 0 && <p className="text-slate-500">En attente d&apos;un client. Dès qu&apos;il tape son numéro sur la tablette, sa fiche s&apos;ouvre ici automatiquement.</p>}
            {sessions.map((s) => (
              <div key={s.sessionId} className={`rounded-xl p-3 ring-2 transition ${arrived === s.sessionId ? "animate-pop bg-emerald-50 ring-emerald-500" : selected?.customerId === s.customer.id ? "ring-brand" : "ring-slate-100"}`}>
                <button className="w-full text-left" onClick={() => selectSession(s)}>
                  <div className="text-lg font-semibold">{s.customer.firstName ?? "Client"} <span className="font-normal text-slate-500">{s.customer.maskedPhone}</span></div>
                  <div className="text-slate-600">{s.customer.balance} points{s.customer.tier ? ` · ${s.customer.tier.name}` : ""} · {s.deviceName}</div>
                </button>
                {s.status === "AWAITING_AUTH" && s.authMethod === "STAFF_VALIDATION" && (
                  <button className="btn-brand mt-2 w-full" disabled={busy} onClick={() => validateIdentity(s)}>
                    Confirmer l&apos;identité{s.customer.pinLocked ? " (PIN bloqué)" : ""}
                  </button>
                )}
                {s.status === "AWAITING_AUTH" && s.authMethod !== "STAFF_VALIDATION" && <div className="mt-2 text-sm text-slate-500">Saisie du code en cours…</div>}
                {s.status === "IDENTIFIED" && <div className="mt-2 text-sm font-medium text-emerald-700">Identifié ✓</div>}
              </div>
            ))}
          </div>
          <div className="card space-y-3">
            <h2 className="text-lg font-semibold">Rechercher un client</h2>
            <form onSubmit={(e) => { e.preventDefault(); doSearch(); }} className="flex gap-2">
              <input className="input" inputMode="tel" placeholder="0470 12 34 56" value={search} onChange={(e) => setSearch(e.target.value)} />
              <button className="btn-dark" disabled={busy || search.length < 9}>OK</button>
            </form>
          </div>
        </section>

        {/* Fiche client */}
        <section>
          {!detail ? (
            <div className="card flex min-h-[300px] items-center justify-center text-lg text-slate-500">Sélectionnez un client</div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-2">
              <div className="card space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-2xl font-bold">{detail.firstName ?? "Client"}</div>
                    <div className="text-slate-500">{detail.maskedPhone}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-4xl font-black">{detail.balance}</div>
                    <div className="text-slate-500">points{detail.tier ? ` · ${detail.tier.name}` : ""}</div>
                  </div>
                </div>
                {detail.offers.map((o) => (
                  <div key={o.id} className="flex items-center justify-between gap-3 rounded-xl bg-amber-100 px-4 py-3 text-amber-900">
                    <span className="font-semibold">🎁 Offre reçue par SMS : {o.title}</span>
                    <button className="btn-dark px-4 py-2" disabled={busy} onClick={() => act(async () => {
                      await api(`/api/v1/pos/offers/${o.id}/redeem`, { body: {} });
                      flash("ok", `Offre « ${o.title} » appliquée`);
                      await loadDetail(detail.id);
                    })}>Appliquer</button>
                  </div>
                ))}
                {detail.wheelToday?.isReward && (
                  <div className="rounded-lg bg-amber-100 px-3 py-2 font-medium text-amber-900">🎡 Lot gagné à la roue aujourd&apos;hui : {detail.wheelToday.label} — à remettre au client</div>
                )}
                {selected?.sessionId && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">Le résultat s&apos;affichera sur la tablette.</div>}
                <div>
                  <div className="label">Montant de l&apos;achat</div>
                  <div className="mb-3 rounded-xl bg-slate-100 py-3 text-center text-4xl font-bold">{formatEuros(amountCents)}</div>
                  <Keypad
                    onDigit={(d) => setAmount((a) => (a.length < 7 ? (a + d).replace(/^0+/, "") : a))}
                    onDelete={() => setAmount((a) => a.slice(0, -1))}
                    onSubmit={submitPurchase}
                    submitLabel="Valider"
                    submitDisabled={busy}
                  />
                </div>
              </div>

              <div className="space-y-5">
                <div className="card space-y-3">
                  <h3 className="text-lg font-semibold">Récompenses</h3>
                  {rewards.length === 0 && <p className="text-slate-500">Aucune récompense configurée.</p>}
                  {rewards.map((r) => {
                    const ok = detail.balance >= r.pointsCost && (r.stock === null || r.stock > 0);
                    return (
                      <div key={r.id} className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium">{r.name}</div>
                          <div className="text-sm text-slate-500">{r.pointsCost} points{r.stock !== null ? ` · stock ${r.stock}` : ""}</div>
                        </div>
                        <button className="btn-brand" disabled={!ok || busy} onClick={() => redeem(r)}>Remettre</button>
                      </div>
                    );
                  })}
                </div>

                <div className="card space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-ghost" onClick={() => setModal("adjust")}>Corriger les points</button>
                    <button className="btn-ghost" onClick={() => setModal("takeover")}>Reprendre une ancienne carte</button>
                    {(detail.consents.MARKETING_SMS || detail.consents.MARKETING_EMAIL) && <button className="btn-ghost" onClick={optOut}>Désinscrire du marketing</button>}
                  </div>
                  {isOwner && (
                    <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                      <span className="w-full text-sm font-medium text-slate-500">Droits RGPD du client</span>
                      <a className="btn-ghost" href={`/api/v1/gdpr/customers/${detail.id}/export`}>Exporter ses données</a>
                      <button className="btn-ghost" onClick={() => setModal("rectify")}>Rectifier</button>
                      <button className="btn-ghost text-red-700" onClick={() => setModal("erase")}>Supprimer</button>
                    </div>
                  )}
                  <div className="text-sm text-slate-500">
                    Marketing : SMS {detail.consents.MARKETING_SMS ? "oui" : "non"} · e-mail {detail.consents.MARKETING_EMAIL ? "oui" : "non"}
                  </div>
                </div>

                <div className="card">
                  <h3 className="mb-3 text-lg font-semibold">Historique</h3>
                  <ul className="divide-y divide-slate-100">
                    {detail.history.map((h) => (
                      <li key={h.id} className="flex justify-between gap-3 py-2 text-sm">
                        <div>
                          <div className="font-medium">{TYPE_LABEL[h.type] ?? h.type}{h.purchaseAmountCents != null ? ` · ${formatEuros(h.purchaseAmountCents)}` : ""}</div>
                          <div className="text-slate-500">{formatDate(h.occurredAt)}{h.staff ? ` · ${h.staff}` : ""}{h.reason ? ` · ${h.reason}` : ""}</div>
                        </div>
                        <div className={`font-semibold ${h.points < 0 ? "text-red-600" : "text-emerald-700"}`}>{h.points > 0 ? "+" : ""}{h.points}</div>
                      </li>
                    ))}
                    {detail.history.length === 0 && <li className="py-2 text-slate-500">Aucun mouvement</li>}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {modal === "adjust" && detail && (
        <AdjustModal
          onClose={() => setModal(null)}
          onSubmit={(points, reason) =>
            act(async () => {
              const r = await api<{ balance: number; alert: boolean }>(`/api/v1/pos/customers/${detail.id}/adjustments`, { body: { points, reason } });
              setModal(null);
              flash(r.alert ? "warn" : "ok", `Correction enregistrée. Solde : ${r.balance}${r.alert ? " — nombre de corrections inhabituel, signalé au propriétaire" : ""}`);
              await loadDetail(detail.id);
            })
          }
        />
      )}
      {modal === "takeover" && detail && (
        <TakeoverModal
          onClose={() => setModal(null)}
          onSubmit={(points, source) =>
            act(async () => {
              const r = await api<{ balance: number }>(`/api/v1/pos/customers/${detail.id}/adjustments`, { body: { points, reason: `Reprise ancienne carte : ${source}` } });
              setModal(null);
              flash("ok", `${points} points repris de l'ancienne carte. Nouveau solde : ${r.balance}`);
              await loadDetail(detail.id);
            })
          }
        />
      )}
      {modal === "erase" && detail && (
        <EraseModal
          onClose={() => setModal(null)}
          onSubmit={(reason) =>
            act(async () => {
              await api(`/api/v1/gdpr/customers/${detail.id}/erase`, { body: { reason } });
              setModal(null);
              setSelected(null);
              flash("ok", "Client supprimé définitivement");
            })
          }
        />
      )}
      {modal === "rectify" && detail && (
        <RectifyModal
          initialFirstName={detail.firstName ?? ""}
          onClose={() => setModal(null)}
          onSubmit={(firstName, phone) =>
            act(async () => {
              await api(`/api/v1/pos/customers/${detail.id}`, { method: "PATCH", body: { firstName: firstName || null, ...(phone ? { phone } : {}) } });
              setModal(null);
              flash("ok", "Données rectifiées");
              await loadDetail(detail.id);
            })
          }
        />
      )}
    </main>
  );
}

function AdjustModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (points: number, reason: string) => void }) {
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const n = Number(points);
  return (
    <Modal title="Corriger les points" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Points (négatif pour retirer)</label>
          <input className="input" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value.replace(/[^\d-]/g, ""))} placeholder="ex. 20 ou -20" />
        </div>
        <div>
          <label className="label">Motif (obligatoire)</label>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex. Achat oublié hier" maxLength={200} />
        </div>
        <p className="text-sm text-slate-500">Chaque correction est enregistrée avec votre nom dans le journal d&apos;audit.</p>
        <button className="btn-dark w-full" disabled={!Number.isInteger(n) || n === 0 || reason.trim().length < 3} onClick={() => onSubmit(n, reason)}>Enregistrer</button>
      </div>
    </Modal>
  );
}

function TakeoverModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (points: number, source: string) => void }) {
  const [points, setPoints] = useState("");
  const [source, setSource] = useState("carte à tampons papier");
  const n = Number(points);
  return (
    <Modal title="Reprendre une ancienne carte" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-slate-600">Le client avait une carte de fidélité avant (papier ou autre programme) ? Reportez ses points ici pour qu&apos;il ne perde rien.</p>
        <div>
          <label className="label" htmlFor="takeover-points">Points à reprendre</label>
          <input id="takeover-points" className="input" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value.replace(/\D/g, ""))} placeholder="ex. 80" />
          <p className="mt-1 text-sm text-slate-500">Astuce : pour une carte à tampons, comptez la valeur de chaque tampon (ex. 8 tampons × 10 points).</p>
        </div>
        <div>
          <label className="label" htmlFor="takeover-source">Ancienne carte</label>
          <input id="takeover-source" className="input" value={source} maxLength={60} onChange={(e) => setSource(e.target.value)} />
        </div>
        <button className="btn-dark w-full" disabled={!Number.isInteger(n) || n <= 0 || source.trim().length < 3} onClick={() => onSubmit(n, source.trim())}>Reprendre {n > 0 ? `${n} points` : "les points"}</button>
      </div>
    </Modal>
  );
}

function EraseModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("Demande du client");
  const [confirmText, setConfirmText] = useState("");
  return (
    <Modal title="Supprimer définitivement ce client" onClose={onClose}>
      <div className="space-y-4">
        <p>Le numéro, le prénom et le code du client seront effacés. Ses points seront perdus. <strong>Cette action est irréversible.</strong></p>
        <p className="text-sm text-slate-500">Pensez à exporter ses données d&apos;abord s&apos;il les a demandées.</p>
        <div>
          <label className="label">Motif</label>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div>
          <label className="label">Tapez SUPPRIMER pour confirmer</label>
          <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
        </div>
        <button className="btn-danger w-full" disabled={confirmText !== "SUPPRIMER" || reason.trim().length < 3} onClick={() => onSubmit(reason)}>Supprimer définitivement</button>
      </div>
    </Modal>
  );
}

function RectifyModal({ initialFirstName, onClose, onSubmit }: { initialFirstName: string; onClose: () => void; onSubmit: (firstName: string, phone: string) => void }) {
  const [firstName, setFirstName] = useState(initialFirstName);
  const [phone, setPhone] = useState("");
  return (
    <Modal title="Rectifier les données" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Prénom</label>
          <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={40} />
        </div>
        <div>
          <label className="label">Nouveau numéro (laisser vide pour ne pas changer)</label>
          <input className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <button className="btn-dark w-full" onClick={() => onSubmit(firstName, phone)}>Enregistrer</button>
      </div>
    </Modal>
  );
}

