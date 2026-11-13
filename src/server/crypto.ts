import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { env } from "./env";

const KEY_VERSION = 1;

function key(name: "DATA_ENCRYPTION_KEY" | "LOOKUP_HMAC_KEY"): Buffer {
  const k = Buffer.from(env()[name], "base64");
  if (k.length !== 32) throw new Error(`${name} doit faire 32 octets (base64)`);
  return k;
}

/** AES-256-GCM. Format : [version 1o][iv 12o][tag 16o][texte chiffré]. */
export function encrypt(plain: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("DATA_ENCRYPTION_KEY"), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([KEY_VERSION]), iv, cipher.getAuthTag(), ct]);
}

export function decrypt(blob: Uint8Array): string {
  const buf = Buffer.from(blob);
  if (buf[0] !== KEY_VERSION) throw new Error("Version de clé inconnue");
  const iv = buf.subarray(1, 13);
  const tag = buf.subarray(13, 29);
  const decipher = createDecipheriv("aes-256-gcm", key("DATA_ENCRYPTION_KEY"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(buf.subarray(29)), decipher.final()]).toString("utf8");
}

/** Empreinte de recherche (HMAC-SHA256). La valeur doit être normalisée avant. */
export function lookupHash(kind: string, normalizedValue: string): string {
  return createHmac("sha256", key("LOOKUP_HMAC_KEY")).update(`${kind}:${normalizedValue}`).digest("hex");
}

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/** Jeton aléatoire (sessions, appareils). Seule son empreinte SHA-256 est stockée. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export function randomDigits(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += randomInt(0, 10).toString();
  return s;
}

const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0/O, 1/I
export function randomPairingCode(len = 8): string {
  let s = "";
  for (let i = 0; i < len; i++) s += PAIRING_ALPHABET[randomInt(0, PAIRING_ALPHABET.length)];
  return s;
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// Argon2id (paramètres OWASP 2024 : m=19 Mio, t=2, p=1)
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
export const hashSecret = (secret: string) => argonHash(secret, ARGON);
export async function verifySecret(hashed: string, secret: string): Promise<boolean> {
  try {
    return await argonVerify(hashed, secret);
  } catch {
    return false;
  }
}

/** Haché factice pour égaliser le temps de réponse quand le compte n'existe pas. */
let dummyHash: Promise<string> | null = null;
export const getDummyHash = () => (dummyHash ??= hashSecret("revio-dummy-password"));
