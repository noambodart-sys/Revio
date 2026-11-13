import { env } from "./env";

export interface SmsProvider {
  send(toE164: string, text: string): Promise<void>;
}

/** Développement : le SMS est écrit dans les logs du serveur (jamais en production). */
const consoleProvider: SmsProvider = {
  async send(to, text) {
    if (env().NODE_ENV === "production") throw new Error("SMS_PROVIDER=console interdit en production");
    console.info(`[SMS → ${to}] ${text}`);
  },
};

/** Brevo (fournisseur européen). */
const brevoProvider: SmsProvider = {
  async send(to, text) {
    const res = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
      method: "POST",
      headers: { "api-key": env().BREVO_API_KEY ?? "", "content-type": "application/json" },
      body: JSON.stringify({ sender: env().SMS_SENDER, recipient: to.replace("+", ""), content: text, type: "transactional" }),
    });
    if (!res.ok) throw new Error(`Brevo SMS: HTTP ${res.status}`);
  },
};

let override: SmsProvider | null = null;
/** Pour les tests. */
export const setSmsProvider = (p: SmsProvider | null) => (override = p);

export function sms(): SmsProvider {
  if (override) return override;
  return env().SMS_PROVIDER === "brevo" ? brevoProvider : consoleProvider;
}
