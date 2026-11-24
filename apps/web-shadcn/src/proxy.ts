import { buildContentSecurityPolicy, createNonce } from "@getsetgo/web-security";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Runs before every page render: creates a one-time nonce and a strict Content Security Policy.
 * Next.js reads the nonce from the request's CSP header and adds it to its own scripts.
 */
export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildContentSecurityPolicy({ nonce, isDev: process.env.NODE_ENV !== "production" });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

// Must be a static literal (Next.js reads it at build time). Pages only: skip the API proxy,
// static files and link prefetches.
export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
