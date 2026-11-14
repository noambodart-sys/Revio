import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  SYSTEM_DATABASE_URL: z.string().min(1),
  DATA_ENCRYPTION_KEY: z.string().min(1),
  LOOKUP_HMAC_KEY: z.string().min(1),
  SMS_PROVIDER: z.enum(["console", "brevo"]).default("console"),
  BREVO_API_KEY: z.string().optional(),
  SMS_SENDER: z.string().default("Revio"),
  /** Serveur de test uniquement : autorise SMS_PROVIDER=console avec NODE_ENV=production. */
  ALLOW_CONSOLE_SMS: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  APP_URL: z.string().default("http://localhost:3000"),
  NODE_ENV: z.string().default("development"),
});

let cached: z.infer<typeof schema> | null = null;

/** Lecture paresseuse : le build ne dépend pas des secrets. */
export function env() {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}
