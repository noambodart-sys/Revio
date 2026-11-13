/** Client HTTP des écrans. Les erreurs de l'API arrivent avec un message en français. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public data?: Record<string, unknown>) {
    super(message);
  }
}

export class NetworkError extends Error {
  constructor() {
    super("Connexion internet indisponible");
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers: {
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new NetworkError();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } }).error ?? {};
    throw new ApiError(res.status, err.code ?? "ERROR", err.message ?? "Erreur", err as Record<string, unknown>);
  }
  return data as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Erreur inattendue");

/** #b45309 → "180 83 9" pour les variables CSS Tailwind. */
export function hexToRgbTriple(hex?: string | null): string | null {
  const m = hex?.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  return m.slice(1).map((h) => parseInt(h, 16)).join(" ");
}

export function contrastTriple(rgb: string): string {
  const [r, g, b] = rgb.split(" ").map(Number);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "15 23 42" : "255 255 255";
}

export const formatEuros = (cents: number) => (cents / 100).toLocaleString("fr-BE", { style: "currency", currency: "EUR" });
export const formatDate = (d: string | Date) => new Date(d).toLocaleString("fr-BE", { dateStyle: "short", timeStyle: "short" });
