/**
 * Same rules as @getsetgo/observability's scrubSensitive (that package ships TypeScript source,
 * which the compiled API can't load at runtime). Keep the two in sync.
 */
const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|content|summary/i;
const REDACTED = "[redacted]";

export function scrubSensitive<T>(value: T, depth = 0): T {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v: unknown) => scrubSensitive(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : scrubSensitive(inner, depth + 1);
  }
  return out as T;
}
