"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, ApiError, errorMessage } from "@/lib/api";
import { PRODUCT_NAME } from "@/config/product";

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ role: string }>("/api/v1/auth/login", { body: { email, password, totp: totp || null } });
      const next = params.get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : r.role === "REVIO_ADMIN" ? "/admin" : "/caisse";
    } catch (err) {
      if (err instanceof ApiError && err.code === "TOTP_REQUIRED") setNeedTotp(true);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">{PRODUCT_NAME} — Connexion</h1>
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-red-800">{error}</div>}
      <div>
        <label className="label" htmlFor="email">E-mail</label>
        <input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="password">Mot de passe</label>
        <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {needTotp && (
        <div>
          <label className="label" htmlFor="totp">Code de double authentification</label>
          <input id="totp" className="input font-mono tracking-widest" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))} autoFocus />
        </div>
      )}
      <button className="btn-dark w-full" disabled={busy}>Se connecter</button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
