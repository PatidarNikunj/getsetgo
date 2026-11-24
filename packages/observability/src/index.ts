/**
 * Shared observability settings for the web apps and the API: Sentry (errors + tracing) and
 * Google Analytics (consent-gated). Everything is off unless its environment variables are set,
 * so local development and tests need no accounts.
 */

// ---------- Sentry ----------

/** Fields that must never reach Sentry (OWASP A09): credentials, tokens and note content. */
const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|content|summary/i;
const REDACTED = "[redacted]";

/** Recursively replaces sensitive values. Used in Sentry's beforeSend / beforeBreadcrumb. */
export function scrubSensitive<T>(value: T, depth = 0): T {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v: unknown) => scrubSensitive(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : scrubSensitive(inner, depth + 1);
  }
  return out as T;
}

export interface SentryEnv {
  dsn?: string;
  environment?: string;
  release?: string;
  tracesSampleRate?: string;
}

/**
 * What Sentry may collect. Sentry 11's defaults include cookies, headers, request bodies and
 * GraphQL variables, which would leak note text and session data, so everything optional is off.
 */
export const sentryDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: {
      allow: ["user-agent", "content-type", "x-request-id", "sentry-trace", "baggage"] as string[],
    },
    response: false,
  },
  // Empty list = collect no request/response bodies (typed `never[]` to fit Sentry's union).
  httpBodies: [] as never[],
  urlQueryParams: false,
  // Query names are useful; variables carry note text.
  graphQL: { document: true, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
};

/**
 * Options common to every Sentry SDK in the repo (Next.js, NestJS). `enabled` is false without a
 * DSN.
 */
export function sentryOptions(env: SentryEnv) {
  const rate = Number(env.tracesSampleRate ?? "0.2");
  return {
    dsn: env.dsn || undefined,
    enabled: !!env.dsn,
    environment: env.environment ?? "development",
    release: env.release || undefined,
    tracesSampleRate: Number.isFinite(rate) ? Math.min(Math.max(rate, 0), 1) : 0.2,
    dataCollection: sentryDataCollection,
    beforeSend<E>(event: E): E {
      return scrubSensitive(event);
    },
  };
}

// ---------- Google Analytics ----------

/** GA4 measurement ids look like G-XXXXXXXXXX; anything else is ignored. */
export const isValidMeasurementId = (id: string | undefined): id is string =>
  !!id && /^G-[A-Z0-9]{4,12}$/.test(id);

export const GA_SCRIPT_ORIGIN = "https://www.googletagmanager.com";

/**
 * Inline bootstrap for gtag.js, rendered with the CSP nonce only after the visitor accepts
 * analytics. IP anonymization is implicit in GA4; ad features are switched off.
 */
export function gaBootstrapScript(measurementId: string): string {
  if (!isValidMeasurementId(measurementId)) throw new Error("Invalid GA measurement id");
  return [
    "window.dataLayer = window.dataLayer || [];",
    "function gtag(){dataLayer.push(arguments);}",
    "window.gtag = gtag;",
    "gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });",
    "gtag('js', new Date());",
    `gtag('config', '${measurementId}', { allow_google_signals: false, allow_ad_personalization_signals: false });`,
  ].join("\n");
}

/** Extra CSP origins needed once GA is enabled (Sentry goes through a same-origin tunnel). */
export function analyticsCspSources(measurementId: string | undefined) {
  if (!isValidMeasurementId(measurementId)) return {};
  const ga = [
    "https://www.google-analytics.com",
    "https://*.google-analytics.com",
    "https://*.analytics.google.com",
  ];
  return {
    "script-src": [GA_SCRIPT_ORIGIN],
    "connect-src": [...ga, GA_SCRIPT_ORIGIN],
    "img-src": [...ga, GA_SCRIPT_ORIGIN],
  };
}
