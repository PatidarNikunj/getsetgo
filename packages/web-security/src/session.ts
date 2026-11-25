/**
 * Framework-agnostic helpers for the web apps' session handling (specs/001-oauth-login D10).
 * The web apps never verify tokens (they don't have the key): they only decide when to ask the
 * API for a renewal, and the API verifies everything.
 */
import type { CspSources } from "./index";

/**
 * Browsers apply `form-action` to the redirect after a form post too, so the sign-in page must
 * allow the providers' authorization pages.
 */
export function signInCspSources(): CspSources {
  return { "form-action": ["https://accounts.google.com", "https://github.com"] };
}

/** reCAPTCHA v3 origins (sign-in page only, and only when a site key is configured). */
export function recaptchaCspSources(siteKey: string | undefined): CspSources {
  if (!siteKey) return {};
  const origins = ["https://www.google.com/recaptcha/", "https://www.gstatic.com/recaptcha/"];
  return { "script-src": origins, "frame-src": origins, "connect-src": origins };
}

/** Reads `exp` from a JWT without verifying it (only to decide whether to renew early). */
export function jwtExpiresWithin(token: string, seconds: number, nowMs = Date.now()): boolean {
  try {
    const payload = token.split(".")[1];
    if (!payload) return true;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp !== "number" || exp * 1000 - nowMs <= seconds * 1000;
  } catch {
    return true;
  }
}

/** name → value for cookies a Set-Cookie list sets (empty value = deleted). */
export function cookiesFromSetCookie(setCookies: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of setCookies) {
    const pair = line.split(";")[0] ?? "";
    const eq = pair.indexOf("=");
    if (eq > 0) out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return out;
}

export interface RenewResult {
  ok: boolean;
  /** Pass these on to the browser (new cookies, or deletions when renewal failed). */
  setCookies: string[];
}

/** Server-side renewal: POST {apiUrl}/auth/refresh with the refresh cookie. */
export async function renewSession({
  apiUrl,
  refreshCookie,
  origin,
  fetchFn = fetch,
}: {
  apiUrl: string;
  /** "name=value" of the refresh cookie. */
  refreshCookie: string;
  /** This web app's origin (the API only accepts its own web apps). */
  origin: string;
  fetchFn?: typeof fetch;
}): Promise<RenewResult> {
  try {
    const res = await fetchFn(`${apiUrl}/auth/refresh`, {
      method: "POST",
      headers: { cookie: refreshCookie, origin, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: res.status === 204, setCookies: res.headers.getSetCookie() };
  } catch {
    return { ok: false, setCookies: [] };
  }
}

/** Replace or add cookies in a Cookie request header. */
export function withCookies(cookieHeader: string | null, values: Record<string, string>): string {
  const jar = new Map<string, string>();
  for (const part of (cookieHeader ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  for (const [name, value] of Object.entries(values)) {
    if (value) jar.set(name, value);
    else jar.delete(name);
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}
