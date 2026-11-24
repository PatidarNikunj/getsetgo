import { z } from "zod";

/**
 * Environment variables, validated once at startup. The app refuses to boot with a bad config
 * instead of failing later at runtime (OWASP A05).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
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

  CORS_ORIGINS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
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
