import { AUTH_COOKIES } from "@getsetgo/graphql";
import { analyticsCspSources } from "@getsetgo/observability";
import {
  buildContentSecurityPolicy,
  cookiesFromSetCookie,
  createNonce,
  jwtExpiresWithin,
  mergeCspSources,
  recaptchaCspSources,
  renewSession,
  signInCspSources,
  withCookies,
} from "@getsetgo/web-security";
import { type NextRequest, NextResponse } from "next/server";

const apiUrl = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");
/** Pages anyone can open; everything else needs a session. */
const PUBLIC_PAGES = new Set(["/sign-in"]);

/**
 * Runs before every page render:
 * 1. Session: renews an expiring session server-side (the refresh cookie never touches page
 *    scripts) and sends signed-out visitors to /sign-in. Pages still ask the API who the user is;
 *    this is only routing, the API makes every access decision (FR-016).
 * 2. Security: a one-time nonce and a strict Content Security Policy.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PAGES.has(pathname);
  const access = request.cookies.get(AUTH_COOKIES.access)?.value;
  const refresh = request.cookies.get(AUTH_COOKIES.refresh)?.value;

  let setCookies: string[] = [];
  let hasSession = !!access && !jwtExpiresWithin(access, 60);
  if (!hasSession && refresh) {
    const renewed = await renewSession({
      apiUrl,
      refreshCookie: `${AUTH_COOKIES.refresh}=${refresh}`,
      origin: request.nextUrl.origin,
    });
    setCookies = renewed.setCookies;
    hasSession = renewed.ok;
  }

  if (!hasSession && !isPublic) {
    const signIn = new URL("/sign-in", request.url);
    if (pathname !== "/") signIn.searchParams.set("returnTo", pathname + search);
    const redirect = NextResponse.redirect(signIn);
    for (const cookie of setCookies) redirect.headers.append("set-cookie", cookie);
    return redirect;
  }

  const nonce = createNonce();
  const csp = buildContentSecurityPolicy({
    nonce,
    isDev: process.env.NODE_ENV !== "production",
    extra: mergeCspSources(
      // Google Analytics origins, only if a measurement id is configured.
      analyticsCspSources(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID),
      // The sign-in page posts to the providers and may load reCAPTCHA.
      isPublic ? signInCspSources() : {},
      isPublic ? recaptchaCspSources(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) : {},
    ),
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  if (setCookies.length > 0) {
    // This render already uses the renewed cookies.
    requestHeaders.set(
      "cookie",
      withCookies(request.headers.get("cookie"), cookiesFromSetCookie(setCookies)),
    );
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  for (const cookie of setCookies) response.headers.append("set-cookie", cookie);
  // Signed-in pages are never stored, so Back after signing out can't show them (US2-4).
  if (!isPublic) response.headers.set("Cache-Control", "private, no-store");
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
