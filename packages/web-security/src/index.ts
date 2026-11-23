/**
 * Security headers shared by both Next.js apps (OWASP A05, constitution principle III).
 * The CSP uses a per-request nonce generated in each app's `proxy.ts`.
 */

export interface CspOptions {
  nonce: string;
  isDev: boolean;
  /** Extra origins per directive, e.g. analytics or error reporting added in later phases. */
  extra?: Partial<
    Record<"script-src" | "connect-src" | "img-src" | "font-src" | "frame-src", string[]>
  >;
}

/** Random, unguessable nonce for one response. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function buildContentSecurityPolicy({ nonce, isDev, extra = {} }: CspOptions): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'strict-dynamic' lets nonce'd Next.js scripts load their chunks; eval only for dev tooling.
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    // <style> elements need the nonce (CSS-in-JS inserts them); inline style *attributes*, which
    // component libraries set for positioning and animation, are allowed separately.
    "style-src": ["'self'", `'nonce-${nonce}'`],
    "style-src-attr": ["'unsafe-inline'"],
    "img-src": ["'self'", "blob:", "data:"],
    "font-src": ["'self'", "data:"],
    // Dev: hot reload uses a WebSocket to the dev server.
    "connect-src": ["'self'", ...(isDev ? ["ws:", "wss:"] : [])],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  for (const [directive, sources] of Object.entries(extra)) {
    const list = (directives[directive] ??= []);
    if (directive === "frame-src") list.splice(list.indexOf("'none'"), 1);
    list.push(...sources);
  }
  const policy = Object.entries(directives).map(
    ([name, sources]) => `${name} ${sources.join(" ")}`,
  );
  if (!isDev) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

/** Static headers for every response (set in next.config.ts `headers()`). */
export function securityHeaders({ isDev }: { isDev: boolean }): { key: string; value: string }[] {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    },
    ...(isDev
      ? []
      : [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ]),
  ];
}
