"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "./api";

export interface Me {
  id: string;
  email: string;
  displayName: string;
  role: "OWNER" | "STAFF" | "REVIO_ADMIN";
  merchantId: string | null;
  merchantName: string | null;
}

/** Charge l'utilisateur connecté ; redirige vers /connexion sinon. */
export function useSession(allowed: Me["role"][], next: string) {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    api<Me>("/api/v1/auth/me")
      .then((u) => {
        if (!allowed.includes(u.role)) window.location.href = u.role === "REVIO_ADMIN" ? "/admin" : "/caisse";
        else setMe(u);
      })
      .catch((e) => {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) window.location.href = `/connexion?next=${encodeURIComponent(next)}`;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return me;
}

export async function signOut() {
  await api("/api/v1/auth/logout", { body: {} }).catch(() => undefined);
  window.location.href = "/connexion";
}
