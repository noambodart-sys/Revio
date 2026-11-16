/**
 * Longueur d'un SMS. Alphabet GSM 03.38 : 160 caractères (153 par partie au-delà).
 * Un seul caractère hors alphabet (emoji, ç, ê…) fait passer en Unicode : 70 (67 par partie).
 */
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€"; // comptent double

export function smsInfo(text: string) {
  let gsmLength = 0;
  let gsm = true;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) gsmLength += 1;
    else if (GSM_EXTENDED.includes(ch)) gsmLength += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (gsm) {
    const parts = gsmLength <= 160 ? 1 : Math.ceil(gsmLength / 153);
    return { encoding: "GSM" as const, length: gsmLength, parts, perPart: parts === 1 ? 160 : 153 };
  }
  const length = [...text].length;
  const parts = length <= 70 ? 1 : Math.ceil(length / 67);
  return { encoding: "UNICODE" as const, length, parts, perPart: parts === 1 ? 70 : 67 };
}

/** Remplace {variables} puis nettoie les espaces laissés par une variable vide (« Bonjour  ! » → « Bonjour ! »). */
export function fillVariables(text: string, vars: Record<string, string | number | null | undefined>) {
  return text
    .replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k] ?? "") : m))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([,.])/g, "$1")
    .replace(/^\s+|\s+$/g, "")
    .replace(/^[,.;:]\s*/, "")
    .replace(/^\p{Ll}/u, (c) => c.toUpperCase());
}
