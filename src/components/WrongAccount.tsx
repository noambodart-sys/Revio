"use client";
import { roleLabel, signOut, type Me } from "@/lib/use-session";

const HOME: Record<Me["role"], { href: string; label: string }> = {
  STAFF: { href: "/caisse", label: "Aller à la caisse" },
  OWNER: { href: "/gestion", label: "Aller à la gestion" },
  REVIO_ADMIN: { href: "/admin", label: "Aller à l'admin" },
};

/** Affiché quand on ouvre une page avec un compte qui n'y a pas accès (au lieu d'une redirection muette). */
export function WrongAccount({ user, pageName, needed, next }: { user: Me; pageName: string; needed: string; next: string }) {
  const home = HOME[user.role];
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md space-y-5 rounded-2xl bg-white p-7 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-bold">{pageName} : accès réservé</h1>
        <p className="text-slate-600">
          Cette page est réservée {needed}. Vous êtes connecté avec le compte <strong>{user.displayName}</strong> ({roleLabel(user.role)}).
        </p>
        <button className="btn-dark w-full" onClick={() => signOut(next)}>Se connecter avec un autre compte</button>
        <a className="btn-ghost w-full" href={home.href}>{home.label}</a>
      </div>
    </main>
  );
}
