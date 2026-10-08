import "dotenv/config";
import { z } from "zod";

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined));

/** Treats `KEY=` (empty in .env) like an unset variable so the default applies. */
const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  /** Max login/refresh attempts per IP per 15 minutes (raise only for automated E2E runs). */
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(20),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  /** Leave empty for host-only cookies (recommended). Only a bare domain such as ".example.com" – no scheme, port or path. */
  COOKIE_DOMAIN: optionalString.refine((v) => v === undefined || /^\.?(localhost|[a-z0-9-]+(\.[a-z0-9-]+)+)$/i.test(v), {
    message: "COOKIE_DOMAIN must be a bare domain such as .srilankatoursdriver.com (no https://, port or path)",
  }),
  /** "lax" works when frontend & API share a registrable domain; use "none" (HTTPS only) for different domains. */
  COOKIE_SAMESITE: z.preprocess(blankToUndefined, z.enum(["lax", "strict", "none"]).default("lax")),
  /** auto = Secure in production (and always with SameSite=none); true/false force it. */
  COOKIE_SECURE: z.preprocess(blankToUndefined, z.enum(["auto", "true", "false"]).default("auto")),

  /** OAuth client ID (Google Cloud console → Credentials) for customer "Sign in with Google". Empty disables it. */
  GOOGLE_CLIENT_ID: optionalString,

  /** LKR per 1 USD, used only while the live exchange-rate feed is unreachable. */
  FALLBACK_LKR_PER_USD: z.coerce.number().positive().default(300),

  CLOUDINARY_CLOUD_NAME: optionalString,
  CLOUDINARY_API_KEY: optionalString,
  CLOUDINARY_API_SECRET: optionalString,
  CLOUDINARY_ROOT_FOLDER: z.string().default("srilankatoursdriver"),

  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  CORS_ORIGINS: optionalString,
  REVALIDATE_SECRET: optionalString,

  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  SMTP_FROM: z.string().default("Sri Lanka Tours Driver <no-reply@srilankatoursdriver.com>"),
  NOTIFY_EMAIL: optionalString,

  TRANSLATION_PROVIDER: z.preprocess(blankToUndefined, z.enum(["deepl", "google", "libretranslate", "none"]).default("none")),
  TRANSLATION_API_KEY: optionalString,
  TRANSLATION_API_URL: optionalString,
  /** Optional Google Cloud Translation key used for languages DeepL does not support (Sinhala). */
  GOOGLE_TRANSLATE_API_KEY: optionalString,

  TRIPADVISOR_API_KEY: optionalString,
  TRIPADVISOR_LOCATION_ID: optionalString,

  SEED_ADMIN_NAME: z.string().default("Super Admin"),
  SEED_ADMIN_EMAIL: z.string().email().default("info@srilankatoursdriver.com"),
  SEED_ADMIN_PASSWORD: optionalString,
});

const PLACEHOLDER_SECRET = /change[-_ ]?me|replace[-_ ]?(me|this|with)|your[-_ ]?(secret|key)|example|^x+$|^(secret|password|test)$/i;

function isOrigin(value: string): boolean {
  try {
    const u = new URL(value);
    return (u.protocol === "http:" || u.protocol === "https:") && (u.pathname === "/" || u.pathname === "") && !u.search && !u.hash;
  } catch {
    return false;
  }
}

const checkedEnvSchema = envSchema.superRefine((e, ctx) => {
  if (e.COOKIE_SAMESITE === "none" && e.COOKIE_SECURE === "false") {
    ctx.addIssue({ code: "custom", path: ["COOKIE_SECURE"], message: "Browsers reject SameSite=none cookies without Secure – use COOKIE_SECURE=auto or true" });
  }
  for (const origin of (e.CORS_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean)) {
    if (!isOrigin(origin.replace(/\/$/, ""))) {
      ctx.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: `"${origin}" is not an origin like https://www.example.com (no path)` });
    }
  }
  if (e.JWT_ACCESS_SECRET === e.JWT_REFRESH_SECRET) {
    ctx.addIssue({ code: "custom", path: ["JWT_REFRESH_SECRET"], message: "JWT_REFRESH_SECRET must be different from JWT_ACCESS_SECRET" });
  }
  if (e.NODE_ENV === "production") {
    for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "REVALIDATE_SECRET"] as const) {
      const value = e[key];
      if (value && PLACEHOLDER_SECRET.test(value)) ctx.addIssue({ code: "custom", path: [key], message: `${key} looks like a placeholder – generate a long random value` });
    }
    if (e.COOKIE_SECURE === "false") {
      ctx.addIssue({ code: "custom", path: ["COOKIE_SECURE"], message: "COOKIE_SECURE=false is not allowed in production (serve the API over HTTPS)" });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

/** Validates an environment record (exported for tests). */
export function parseEnv(source: Record<string, string | undefined>) {
  return checkedEnvSchema.safeParse(source);
}

function loadEnv(): Env {
  const parsed = parseEnv(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n");
    // Fail fast: never boot with an insecure or incomplete configuration.
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

/** Normalised origins (scheme://host[:port]) allowed for CORS and the CSRF Origin check. */
export const allowedOrigins: string[] = Array.from(
  new Set(
    [env.FRONTEND_URL, ...(env.CORS_ORIGINS ? env.CORS_ORIGINS.split(",") : [])]
      .map((o) => o.trim())
      .filter(Boolean)
      .map((o) => {
        try {
          return new URL(o).origin;
        } catch {
          return o.replace(/\/$/, "");
        }
      }),
  ),
);

/** Whether auth cookies get the Secure flag. */
export const cookieSecure = env.COOKIE_SECURE === "true" || (env.COOKIE_SECURE === "auto" && (isProduction || env.COOKIE_SAMESITE === "none"));
