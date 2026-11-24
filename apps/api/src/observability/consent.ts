/**
 * Reads the visitor's consent cookie (set by the web apps, forwarded by their /api/graphql proxy).
 * Mirrors @getsetgo/consent, which the compiled API can't import at runtime; consent.spec.ts
 * checks both agree.
 */
const CONSENT_COOKIE = "gsg_consent";
const CONSENT_VERSION = 1;

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index !== -1 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

export function hasAnalyticsConsent(cookieHeader: string | undefined): boolean {
  const raw = readCookie(cookieHeader, CONSENT_COOKIE);
  if (!raw) return false;
  const match = /^(\d+)\.a([01])\.\S+$/.exec(decodeURIComponent(raw));
  return !!match && Number(match[1]) === CONSENT_VERSION && match[2] === "1";
}

/** GA client id from the `_ga` cookie ("GA1.1.123.456" → "123.456"). */
export function gaClientId(cookieHeader: string | undefined): string | undefined {
  const value = readCookie(cookieHeader, "_ga");
  return value ? /^GA\d\.\d+\.(\d+\.\d+)$/.exec(value)?.[1] : undefined;
}
