import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

/**
 * Signed visitor IP from the web apps' servers (docs/backends.md#rate-limiting).
 *
 * During server rendering the web apps call the API directly, so every visitor arrives from the
 * host's (Vercel's) IPs and would share one rate-limit bucket. The web server adds the visitor's
 * IP plus a timestamp, signed with CLIENT_IP_SECRET (HMAC-SHA256). The API uses that IP only when
 * the signature verifies and the timestamp is recent; anything else falls back to the connection
 * IP, so a browser that sends these headers itself gains nothing (OWASP A04/A07).
 *
 * Keep in sync with packages/web-security/src/client-ip.ts (client-ip.spec.ts checks both agree).
 */
export const CLIENT_IP_HEADER = "x-getsetgo-client-ip";
export const CLIENT_IP_SIGNATURE_HEADER = "x-getsetgo-client-ip-signature";

/** How far a signature's timestamp may be from now (replay window, allows small clock skew). */
export const CLIENT_IP_MAX_AGE_SECONDS = 60;

const SIGNATURE_FORMAT = /^t=(\d{1,12}),v1=([A-Za-z0-9_-]{43})$/;

/** The signed string: version, timestamp and IP, newline-separated (none can contain one). */
export function clientIpPayload(ip: string, timestamp: number): string {
  return `v1\n${timestamp}\n${ip}`;
}

export function signClientIpPayload(secret: string, ip: string, timestamp: number): string {
  return createHmac("sha256", secret).update(clientIpPayload(ip, timestamp)).digest("base64url");
}

type HeaderValue = string | string[] | undefined;

/** One header value; a repeated header is treated as invalid rather than guessed at. */
function single(value: HeaderValue): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * The visitor IP if the request carries a valid, recent signature for it; otherwise undefined.
 * Without a configured secret, the headers are always ignored.
 */
export function verifiedClientIp(
  headers: Record<string, HeaderValue>,
  secret: string | undefined,
  nowMs = Date.now(),
): string | undefined {
  if (!secret) return undefined;
  const ip = single(headers[CLIENT_IP_HEADER])?.trim();
  const signature = single(headers[CLIENT_IP_SIGNATURE_HEADER])?.trim();
  if (!ip || !signature || isIP(ip) === 0) return undefined;

  const match = SIGNATURE_FORMAT.exec(signature);
  if (!match) return undefined;
  const timestamp = Number(match[1]);
  if (Math.abs(nowMs / 1000 - timestamp) > CLIENT_IP_MAX_AGE_SECONDS) return undefined;

  const expected = Buffer.from(signClientIpPayload(secret, ip, timestamp));
  const given = Buffer.from(match[2] ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected) ? ip : undefined;
}
