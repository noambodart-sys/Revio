"use client";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, formatDate } from "@/lib/api";
import { signOut, useSession } from "@/lib/use-session";
import { PRODUCT_NAME } from "@/config/product";

interface MerchantRow {
  id: string;
  name: string;
  slug: string;
  plan: "ESSENTIEL" | "PRO";
  subscriptionStatus: string;
  trialEndsAt: string | null;
  suspendedAt: string | null;
  createdAt: string;
  _count: { customers: number; devices: number; users: number };
}
interface MerchantDetail extends Omit<MerchantRow, "_count"> {
  vatNumber: string | null;
  city: string | null;
  users: { id: string; email: string; displayName: string; role: string; lastLoginAt: string | null; disabledAt: string | null }[];
  devices: { id: string; name: string; pairedAt: string | null; lastSeenAt: string | null; revokedAt: string | null; pairingCodeExpiresAt: string | null }[];
  _count: { customers: number };
}
interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  reason: string | null;
  createdAt: string;
  actorType: string;
  actorUser: { email: string } | null;
  actorDevice: { name: string } | null;
  merchant: { name: string } | null;
}

const emptyForm = { name: "", slug: "", vatNumber: "", addressLine1: "", postalCode: "", city: "", plan: "ESSENTIEL" as "ESSENTIEL" | "PRO", ownerEmail: "", ownerName: "", ownerPassword: "" };

export default function AdminPage() {
  const me = useSession(["REVIO_ADMIN"], "/admin");
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MerchantDetail | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showCreate, setShowCreate] = useState(false);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadList = useCallback(() => api<MerchantRow[]>("/api/v1/admin/merchants").then(setMerchants).catch((e) => setMsg({ ok: false, text: errorMessage(e) })), []);
  const loadDetail = useCallback(async (id: string) => {
    setDetail(await api<MerchantDetail>(`/api/v1/admin/merchants/${id}`));
    setAudit(await api<AuditRow[]>(`/api/v1/admin/audit?merchantId=${id}`));
  }, []);

  useEffect(() => { if (me) loadList(); }, [me, loadList]);
  useEffect(() => {
    setPairing(null);
    if (selectedId) loadDetail(selectedId).catch((e) => setMsg({ ok: false, text: errorMessage(e) }));
  }, [selectedId, loadDetail]);

  const act = async (fn: () => Promise<void>) => {
    setMsg(null);
    try { await fn(); } catch (e) { setMsg({ ok: false, text: errorMessage(e) }); }
  };

  const createMerchant = () =>
    act(async () => {
      const m = await api<{ id: string }>("/api/v1/admin/merchants", {
        body: {
          name: form.name, slug: form.slug, vatNumber: form.vatNumber || null, addressLine1: form.addressLine1 || null, postalCode: form.postalCode || null, city: form.city || null, plan: form.plan,
          owner: { email: form.ownerEmail, displayName: form.ownerName, password: form.ownerPassword },
        },
      });
      setForm(emptyForm);
      setShowCreate(false);
      await loadList();
      setSelectedId(m.id);
      setMsg({ ok: true, text: "Commerce créé (essai gratuit d'un mois)" });
    });

  if (!me) return <main className="p-6 text-slate-500">Chargement…</main>;

  const field = (key: keyof typeof form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} {...props} />
    </div>
  );

  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between bg-slate-900 px-5 py-3 text-white">
        <div className="text-lg font-bold">Admin {PRODUCT_NAME}</div>
        <div className="flex items-center gap-4 text-sm">
          <span>{me.email}</span>
          <button className="underline" onClick={signOut}>Déconnexion</button>
        </div>
      </header>
      {msg && <div className={`mx-5 mt-4 rounded-lg px-4 py-3 ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{msg.text}</div>}

      <div className="grid gap-5 p-5 lg:grid-cols-[380px_1fr]">
        <section className="card space-y-3 self-start">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Commerces ({merchants.length})</h2>
            <button className="btn-dark px-3 py-2 text-sm" onClick={() => setShowCreate((v) => !v)}>{showCreate ? "Fermer" : "+ Nouveau"}</button>
          </div>
          {showCreate && (
            <form className="space-y-3 rounded-xl bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); createMerchant(); }}>
              {field("name", "Nom du commerce", { required: true })}
              {field("slug", "Identifiant (ex. boulangerie-dupont)", { required: true, pattern: "[a-z0-9-]{3,40}" })}
              {field("vatNumber", "N° TVA")}
              {field("addressLine1", "Adresse")}
              <div className="grid grid-cols-2 gap-2">{field("postalCode", "Code postal")}{field("city", "Commune")}</div>
              <div>
                <label className="label">Offre</label>
                <select className="input" value={form.plan} onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value as "ESSENTIEL" | "PRO" }))}>
                  <option value="ESSENTIEL">Essentiel</option>
                  <option value="PRO">Pro</option>
                </select>
              </div>
              <div className="border-t border-slate-200 pt-3 text-sm font-semibold">Compte du propriétaire</div>
              {field("ownerName", "Nom", { required: true })}
              {field("ownerEmail", "E-mail", { required: true, type: "email" })}
              {field("ownerPassword", "Mot de passe provisoire (12 caractères min.)", { required: true, minLength: 12 })}
              <button className="btn-dark w-full">Créer le commerce</button>
            </form>
          )}
          <ul className="divide-y divide-slate-100">
            {merchants.map((m) => (
              <li key={m.id}>
                <button className={`w-full py-3 text-left ${selectedId === m.id ? "font-semibold" : ""}`} onClick={() => setSelectedId(m.id)}>
                  <div className="flex items-center justify-between">
                    <span>{m.name}</span>
                    {m.suspendedAt ? <span className="rounded bg-red-100 px-2 text-xs text-red-800">suspendu</span> : <span className="rounded bg-slate-100 px-2 text-xs">{m.plan}</span>}
                  </div>
                  <div className="text-sm font-normal text-slate-500">{m._count.customers} clients · {m._count.devices} tablette(s) · {m.subscriptionStatus}</div>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-5">
          {!detail ? (
            <div className="card text-slate-500">Sélectionnez un commerce</div>
          ) : (
            <>
              <div className="card flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">{detail.name}</h2>
                  <div className="text-slate-500">{detail.slug} · TVA {detail.vatNumber ?? "—"} · {detail.city ?? "—"} · {detail._count.customers} clients</div>
                  <div className="text-sm text-slate-500">Offre {detail.plan} · {detail.subscriptionStatus}{detail.trialEndsAt ? ` · essai jusqu'au ${formatDate(detail.trialEndsAt)}` : ""}</div>
                </div>
                <button
                  className={detail.suspendedAt ? "btn-dark" : "btn-danger"}
                  onClick={() =>
                    act(async () => {
                      const suspended = !detail.suspendedAt;
                      if (suspended && !confirm(`Suspendre ${detail.name} ? Les vendeurs et tablettes seront bloqués.`)) return;
                      await api(`/api/v1/admin/merchants/${detail.id}/suspend`, { body: { suspended } });
                      await Promise.all([loadDetail(detail.id), loadList()]);
                    })
                  }
                >
                  {detail.suspendedAt ? "Réactiver" : "Suspendre"}
                </button>
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <div className="card space-y-3">
                  <h3 className="text-lg font-semibold">Tablettes</h3>
                  <ul className="divide-y divide-slate-100 text-sm">
                    {detail.devices.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                        <div>
                          <div className="font-medium">{d.name}</div>
                          <div className="text-slate-500">
                            {d.revokedAt ? "révoquée" : d.pairedAt ? `dernier contact ${d.lastSeenAt ? formatDate(d.lastSeenAt) : "—"}` : "en attente d'appairage"}
                          </div>
                        </div>
                        {!d.revokedAt && (
                          <button className="btn-ghost px-3 py-1 text-sm text-red-700" onClick={() => act(async () => {
                            if (!confirm(`Révoquer « ${d.name} » ?`)) return;
                            await api(`/api/v1/admin/devices/${d.id}/revoke`, { body: {} });
                            await loadDetail(detail.id);
                          })}>Révoquer</button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {pairing && (
                    <div className="rounded-xl bg-amber-50 p-4 text-center">
                      <div className="text-sm text-amber-900">Code à saisir sur la tablette (valable jusqu&apos;à {formatDate(pairing.expiresAt)}) :</div>
                      <div className="mt-1 font-mono text-4xl font-bold tracking-widest">{pairing.code}</div>
                    </div>
                  )}
                  <button className="btn-dark w-full" onClick={() => act(async () => {
                    const name = prompt("Nom de la tablette", "Tablette comptoir");
                    if (!name) return;
                    setPairing(await api(`/api/v1/admin/merchants/${detail.id}/devices`, { body: { name } }));
                    await loadDetail(detail.id);
                  })}>Appairer une tablette</button>
                </div>

                <div className="card space-y-3">
                  <h3 className="text-lg font-semibold">Comptes</h3>
                  <ul className="divide-y divide-slate-100 text-sm">
                    {detail.users.map((u) => (
                      <li key={u.id} className="py-2">
                        <div className="font-medium">{u.displayName} <span className="text-slate-500">({u.role === "OWNER" ? "propriétaire" : "vendeur"})</span></div>
                        <div className="text-slate-500">{u.email} · {u.lastLoginAt ? `connecté ${formatDate(u.lastLoginAt)}` : "jamais connecté"}</div>
                      </li>
                    ))}
                  </ul>
                  <AddUserForm onSubmit={(body) => act(async () => {
                    await api(`/api/v1/admin/merchants/${detail.id}/users`, { body });
                    await loadDetail(detail.id);
                    setMsg({ ok: true, text: "Compte créé" });
                  })} />
                </div>
              </div>

              <div className="card">
                <h3 className="mb-3 text-lg font-semibold">Journal d&apos;audit</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-slate-500">
                      <tr><th className="py-1 pr-3">Date</th><th className="pr-3">Action</th><th className="pr-3">Par</th><th>Motif</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {audit.map((a) => (
                        <tr key={a.id}>
                          <td className="whitespace-nowrap py-1 pr-3">{formatDate(a.createdAt)}</td>
                          <td className={`pr-3 font-mono ${a.action.startsWith("fraud.") ? "font-bold text-red-700" : ""}`}>{a.action}</td>
                          <td className="pr-3">{a.actorUser?.email ?? a.actorDevice?.name ?? a.actorType.toLowerCase()}</td>
                          <td>{a.reason ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function AddUserForm({ onSubmit }: { onSubmit: (b: { email: string; displayName: string; password: string; role: "OWNER" | "STAFF" }) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ email: "", displayName: "", password: "", role: "STAFF" as "OWNER" | "STAFF" });
  if (!open) return <button className="btn-ghost w-full" onClick={() => setOpen(true)}>Ajouter un compte</button>;
  return (
    <form className="space-y-2 rounded-xl bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); onSubmit(f); setOpen(false); }}>
      <input className="input" placeholder="Nom" required value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />
      <input className="input" placeholder="E-mail" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <input className="input" placeholder="Mot de passe provisoire (12+)" required minLength={12} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
      <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as "OWNER" | "STAFF" })}>
        <option value="STAFF">Vendeur</option>
        <option value="OWNER">Propriétaire</option>
      </select>
      <button className="btn-dark w-full">Créer</button>
    </form>
  );
}
