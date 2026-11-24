import { z } from "zod";

const optionalString = z
  .string()
  .optional()
  .or(z.literal("").transform(() => undefined));

/** GitHub OAuth apps allow one callback URL, so there is one app per web-app origin. */
const githubOAuthApps = z
  .string()
  .default("{}")
  .transform((value, ctx) => {
    try {
      return JSON.parse(value === "" ? "{}" : value) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "GITHUB_OAUTH_APPS must be JSON" });
      return z.NEVER;
    }
  })
  .pipe(
    z.record(
      z.url(),
      z.object({ clientId: z.string().min(1), clientSecret: z.string().min(1) }).strict(),
    ),
  );

/**
 * Environment variables, validated once at startup. The app refuses to boot with a bad config
 * instead of failing later at runtime (OWASP A05).
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    // Where this instance runs. Defaults to the safest value: test-only features stay off unless an
    // environment says otherwise (docker-compose and local .env files do).
    APP_ENV: z.enum(["development", "test", "production"]).default("production"),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

    DATABASE_URL: z.string().startsWith("postgresql://"),
    MONGODB_URI: z.string().startsWith("mongodb"),
    REDIS_URL: z.string().startsWith("redis"),

    AI_SERVICE_URL: z.url(),
    SERVICE_JWT_SECRET: z.string().min(32, "SERVICE_JWT_SECRET must be at least 32 characters"),

    // Observability: all optional; features stay off when unset.
    SENTRY_DSN: z
      .url()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    GA_MEASUREMENT_ID: z
      .string()
      .regex(/^G-[A-Z0-9]{4,12}$/)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    GA_API_SECRET: z
      .string()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    GA_MP_ENDPOINT: z.url().default("https://www.google-analytics.com/mp/collect"),

    // Proxies in front of the API whose X-Forwarded-For can be trusted, so rate limiting sees the
    // real client IP. Local/Docker: 1. Render behind the Vercel rewrite: 2 (Vercel, Render's LB).
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),

    CORS_ORIGINS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),

    // ---------- Auth (specs/001-oauth-login) ----------
    AUTH_JWT_SECRET: z.string().min(32, "AUTH_JWT_SECRET must be at least 32 characters"),
    // Comma-separated: emails, github:<login>, test:<login> or test:<prefix>*. Empty = nobody.
    AUTH_ALLOWLIST: z.string().default(""),
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    GITHUB_OAUTH_APPS: githubOAuthApps,
    RECAPTCHA_SECRET_KEY: optionalString,
    RECAPTCHA_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.5),
    AUTH_TEST_PROVIDER: z
      .enum(["enabled", "disabled"])
      .optional()
      .or(z.literal("").transform(() => undefined)),
  })
  .superRefine((env, ctx) => {
    if (env.AUTH_TEST_PROVIDER === "enabled" && env.APP_ENV === "production") {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_TEST_PROVIDER"],
        message: "the test sign-in provider can never be enabled when APP_ENV=production",
      });
    }
    if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_CLIENT_ID"],
        message: "set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${issues.join("\n")}`);
  }
  return result.data;
}
