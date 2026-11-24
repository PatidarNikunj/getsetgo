/**
 * The visitor's cookie-consent choice, stored in a first-party cookie so both the web apps
 * (server and browser) and the API (it receives the cookie through the /api/graphql proxy) can
 * read it. Only "analytics" is optional: strictly necessary storage (this cookie, the theme
 * choice, form drafts in IndexedDB) needs no consent. Sentry and Vercel Analytics are cookieless.
 */

export const CONSENT_COOKIE = "gsg_consent";
/** Bump when the categories change, so everyone is asked again. */
export const CONSENT_VERSION = 1;
/** Ask again after 180 days (common guidance; the CNIL recommends at most 13 months). */
export const CONSENT_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

export interface Consent {
  version: number;
  analytics: boolean;
  /** When the choice was made (ISO 8601), kept as a simple record of consent. */
  decidedAt: string;
}

export function createConsent(analytics: boolean, now = new Date()): Consent {
  return { version: CONSENT_VERSION, analytics, decidedAt: now.toISOString() };
}

/** Compact cookie value: "1.a1.2026-11-24T10:00:00.000Z" (version, analytics flag, time). */
export function serializeConsent(consent: Consent): string {
  return `${consent.version}.a${consent.analytics ? 1 : 0}.${consent.decidedAt}`;
}

/** Returns null for a missing, malformed or outdated cookie (the visitor must choose again). */
export function parseConsent(value: string | undefined | null): Consent | null {
  if (!value) return null;
  const match = /^(\d+)\.a([01])\.(\d{4}-\d{2}-\d{2}T[\d:.]+Z)$/.exec(decodeURIComponent(value));
  if (!match) return null;
  const [, version, analytics, decidedAt] = match;
  if (Number(version) !== CONSENT_VERSION || Number.isNaN(Date.parse(decidedAt!))) return null;
  return { version: CONSENT_VERSION, analytics: analytics === "1", decidedAt: decidedAt! };
}

/** Reads one cookie from a `Cookie` header (server side) or `document.cookie` (browser). */
export function readCookie(
  cookieHeader: string | undefined | null,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

export function consentFromCookieHeader(cookieHeader: string | undefined | null): Consent | null {
  return parseConsent(readCookie(cookieHeader, CONSENT_COOKIE));
}

export function hasAnalyticsConsent(cookieHeader: string | undefined | null): boolean {
  return consentFromCookieHeader(cookieHeader)?.analytics === true;
}

/**
 * `document.cookie` string for the consent cookie. Readable by JavaScript on purpose (the
 * banner needs it) and holds no secret. SameSite=Lax; Secure on HTTPS.
 */
export function consentCookieString(consent: Consent, { secure }: { secure: boolean }): string {
  return [
    `${CONSENT_COOKIE}=${encodeURIComponent(serializeConsent(consent))}`,
    "Path=/",
    `Max-Age=${CONSENT_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

/**
 * Google Analytics' client id from its `_ga` cookie ("GA1.1.123456789.1700000000" →
 * "123456789.1700000000"). The API uses it to attribute server-side events to the same visitor.
 */
export function gaClientIdFromCookieHeader(
  cookieHeader: string | undefined | null,
): string | undefined {
  const value = readCookie(cookieHeader, "_ga");
  const match = value ? /^GA\d\.\d+\.(\d+\.\d+)$/.exec(value) : null;
  return match?.[1];
}
