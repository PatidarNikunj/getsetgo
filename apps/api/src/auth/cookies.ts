import type { CookieOptions, Response } from "express";

/**
 * Session cookies (specs/001-oauth-login research D5). `__Host-` means: Secure, Path=/, no Domain,
 * so the cookie belongs to exactly the web app origin that received it through its /api rewrite.
 * Browsers treat http://localhost as secure, so the same names work locally and in e2e tests.
 */
export const ACCESS_COOKIE = "__Host-gsg_at";
export const REFRESH_COOKIE = "__Host-gsg_rt";
export const OAUTH_STATE_COOKIE = "__Host-gsg_oauth";

export const ACCESS_TTL_SECONDS = 15 * 60;
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

const base: CookieOptions = { httpOnly: true, secure: true, sameSite: "lax", path: "/" };

// Flags written out (not spread from `base`) so static analysis (CodeQL) can see them.
export function cookieOptions(maxAgeSeconds: number): CookieOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds * 1000,
  };
}

export function setSessionCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, cookieOptions(ACCESS_TTL_SECONDS));
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOptions(SESSION_TTL_SECONDS));
  noStore(res);
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, base);
  res.clearCookie(REFRESH_COOKIE, base);
  noStore(res);
}

export function setOAuthStateCookie(res: Response, state: string): void {
  res.cookie(OAUTH_STATE_COOKIE, state, cookieOptions(OAUTH_STATE_TTL_SECONDS));
}

export function clearOAuthStateCookie(res: Response): void {
  res.clearCookie(OAUTH_STATE_COOKIE, base);
}

/** Responses that carry or change credentials must never be cached. */
export function noStore(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
}

/** Read a cookie set by cookie-parser; anything that isn't a non-empty string counts as absent. */
export function readCookie(
  req: { cookies?: Record<string, unknown> },
  name: string,
): string | undefined {
  const value = req.cookies?.[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
