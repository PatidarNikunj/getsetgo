/**
 * Same rules as @getsetgo/observability's scrubSensitive (that package ships TypeScript source,
 * which the compiled API can't load at runtime). Keep the two in sync.
 */
const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|content|summary/i;
const REDACTED = "[redacted]";

/**
 * Sign-in callbacks carry a one-time authorization code and state in the query string. Logs and
 * error reports keep only the path for /auth/* URLs (specs/001-oauth-login research D13).
 */
export function stripAuthQuery(url: string): string {
  const path = url.split("?")[0] ?? url;
  return /(^|\/)auth\//.test(path) ? path : url;
}

/** pino request serializer: /auth/* requests are logged without their query (URL or parsed). */
export function redactAuthRequest<T extends { url?: string; query?: unknown }>(req: T): T {
  if (!req.url || stripAuthQuery(req.url) === req.url) return req;
  return { ...req, url: stripAuthQuery(req.url), query: "[redacted]" };
}

/** Sentry events: remove query strings from auth URLs (dataCollection already drops most). */
export function scrubAuthUrls<T extends { request?: { url?: string; query_string?: unknown } }>(
  event: T,
): T {
  if (event.request?.url && stripAuthQuery(event.request.url) !== event.request.url) {
    event.request.url = stripAuthQuery(event.request.url);
    delete event.request.query_string;
  }
  return event;
}

export function scrubSensitive<T>(value: T, depth = 0): T {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v: unknown) => scrubSensitive(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : scrubSensitive(inner, depth + 1);
  }
  return out as T;
}
