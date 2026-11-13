import { describe, expect, it } from "vitest";
import { decrypt, encrypt, hashSecret, lookupHash, verifySecret } from "@/server/crypto";
import { maskPhone, normalizePhone } from "@/server/phone";
import { base32Encode, totpAt, verifyTotp } from "@/server/totp";
import { validatePin } from "@/server/services/customers";

describe("chiffrement", () => {
  it("aller-retour AES-GCM, IV différent à chaque fois", () => {
    const a = encrypt("+32470123412");
    const b = encrypt("+32470123412");
    expect(a.equals(b)).toBe(false);
    expect(decrypt(a)).toBe("+32470123412");
    expect(a.toString("utf8")).not.toContain("470123412");
  });
  it("refuse un chiffré altéré", () => {
    const a = encrypt("secret");
    a[a.length - 1] ^= 1;
    expect(() => decrypt(a)).toThrow();
  });
  it("empreinte HMAC déterministe et dépendante du type", () => {
    expect(lookupHash("PHONE", "+32470123412")).toBe(lookupHash("PHONE", "+32470123412"));
    expect(lookupHash("PHONE", "+32470123412")).not.toBe(lookupHash("NFC_TAG", "+32470123412"));
  });
  it("Argon2id", async () => {
    const h = await hashSecret("4821");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifySecret(h, "4821")).toBe(true);
    expect(await verifySecret(h, "4822")).toBe(false);
  });
});

describe("téléphone", () => {
  it("normalise les formats belges", () => {
    for (const v of ["0470 12 34 12", "+32470123412", "0032 470/12.34.12", "470123412"]) {
      expect(normalizePhone(v)).toBe("+32470123412");
    }
    expect(normalizePhone("+33 6 12 34 56 78")).toBe("+33612345678");
  });
  it("refuse les numéros invalides ou fixes", () => {
    expect(() => normalizePhone("123")).toThrow();
    expect(() => normalizePhone("02 123 45 67")).toThrow(); // fixe bruxellois
  });
  it("masque à l'affichage", () => {
    expect(maskPhone("+32470123412")).toBe("+32 4•• •• •• 12");
  });
});

describe("PIN", () => {
  it("refuse les PIN faibles ou mal formés", () => {
    expect(() => validatePin("1234")).toThrow();
    expect(() => validatePin("0000")).toThrow();
    expect(() => validatePin("12a4")).toThrow();
    expect(() => validatePin("48213")).toThrow();
    expect(() => validatePin("4821")).not.toThrow();
  });
});

describe("TOTP (RFC 6238)", () => {
  // Vecteur de test officiel : secret ASCII "12345678901234567890", T = 59 s → 287082 (6 chiffres)
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it("vecteurs RFC", () => {
    expect(totpAt(secret, 59_000)).toBe("287082");
    expect(totpAt(secret, 1111111109_000)).toBe("081804");
  });
  it("fenêtre ±30 s", () => {
    expect(verifyTotp(secret, totpAt(secret, 1_000_000_000), 1_000_000_000 + 30_000)).toBe(true);
    expect(verifyTotp(secret, totpAt(secret, 1_000_000_000), 1_000_000_000 + 120_000)).toBe(false);
  });
});
