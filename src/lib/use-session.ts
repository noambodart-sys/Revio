"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "./api";

export interface Me {
  id: string;
  email: string | null;
  displayName: string;
  role: "OWNER" | "STAFF" | "REVIO_ADMIN";
  merchantId: string | null;
  merchantName: string | null;
}

const ROLE_LABEL: Record<Me["role"], string> = { OWNER: "propriétaire", STAFF: "vendeur", REVIO_ADMIN: "équipe Revio" };
export const roleLabel = (r: Me["role"]) => ROLE_LABEL[r];

/**
 * Charge l'utilisateur connecté. Non connecté → page de connexion.
 * Connecté avec un compte qui n'a pas accès à cette page → `wrongAccount` (on l'explique au lieu de rediriger).
 */
export function useSession(allowed: Me["role"][], next: string) {
  const [me, setMe] = useState<Me | null>(null);
  const [wrongAccount, setWrongAccount] = useState<Me | null>(null);
  useEffect(() => {
    api<Me>("/api/v1/auth/me")
      .then((u) => (allowed.includes(u.role) ? setMe(u) : setWrongAccount(u)))
      .catch((e) => {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) window.location.href = `/connexion?next=${encodeURIComponent(next)}`;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { me, wrongAccount };
}

export async function signOut(next?: string) {
  await api("/api/v1/auth/logout", { body: {} }).catch(() => undefined);
  window.location.href = next ? `/connexion?next=${encodeURIComponent(next)}` : "/connexion";
}
