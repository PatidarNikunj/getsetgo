/**
 * Signed visitor IP for the web apps' server-side calls to the API (docs/backends.md#rate-limiting).
 *
 * Server rendering calls the API from the host's IPs, so without this every visitor would share
 * one rate-limit bucket. We send the visitor's IP with a timestamp, signed with CLIENT_IP_SECRET;
 * the API trusts it only if the signature verifies. Browsers can't produce a valid signature.
 *
 * Keep in sync with apps/api/src/security/client-ip.ts (the API's client-ip.spec.ts checks both).
 */
export const CLIENT_IP_HEADER = "x-getsetgo-client-ip";
export const CLIENT_IP_SIGNATURE_HEADER = "x-getsetgo-client-ip-signature";

/** Minimal header reader: Next.js `headers()`, a `Headers` object or a NextRequest's headers. */
export interface HeaderSource {
  get(name: string): string | null;
}

/**
 * The visitor's IP as reported by the hosting platform. On Vercel both headers are set by the
 * edge network and anything the browser sent is overwritten, which is why signing only happens
 * where CLIENT_IP_SECRET is configured (production and preview on Vercel).
 */
export function visitorIp(headers: HeaderSource): string | undefined {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || undefined;
}

function base64url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** `t=<unix seconds>,v1=<base64url HMAC-SHA256 of "v1\n<t>\n<ip>">` (Web Crypto: Node and edge). */
export async function signClientIp(
  secret: string,
  ip: string,
  nowMs = Date.now(),
): Promise<string> {
  const timestamp = Math.floor(nowMs / 1000);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`v1\n${timestamp}\n${ip}`));
  return `t=${timestamp},v1=${base64url(mac)}`;
}

/**
 * Headers to add to a server-side API request: the visitor IP and its signature, or nothing when
 * no secret is configured or the platform didn't report an IP (the API then uses the connection IP).
 */
export async function clientIpHeaders(
  incoming: HeaderSource,
  secret: string | undefined,
  nowMs = Date.now(),
): Promise<Record<string, string>> {
  const ip = visitorIp(incoming);
  // Only a plain IP (digits, hex, dots, colons) is worth signing; the API validates it again.
  if (!secret || !ip || !/^[0-9a-fA-F.:]{2,45}$/.test(ip)) return {};
  return {
    [CLIENT_IP_HEADER]: ip,
    [CLIENT_IP_SIGNATURE_HEADER]: await signClientIp(secret, ip, nowMs),
  };
}
