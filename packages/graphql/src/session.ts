import { GraphQLRequestError } from "./request";

/** Same-origin auth routes; each Next.js app proxies /api/auth/* to the API. */
export const AUTH_PATH = "/api/auth";

/** Cookie names set by the API (httpOnly: scripts can't read them, only the servers do). */
export const AUTH_COOKIES = { access: "__Host-gsg_at", refresh: "__Host-gsg_rt" } as const;

let inFlight: Promise<boolean> | undefined;

/**
 * Renew the session once, even if many requests notice the expired access cookie at the same
 * time (the API rotates the refresh token on every renewal). Resolves to false when the user
 * has to sign in again.
 */
export function refreshSession(fetchFn: typeof fetch = fetch): Promise<boolean> {
  inFlight ??= fetchFn(`${AUTH_PATH}/refresh`, {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json" },
  })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      inFlight = undefined;
    });
  return inFlight;
}

/** True for the API's "sign in required" error. */
export function isUnauthenticated(error: unknown): boolean {
  return error instanceof GraphQLRequestError && error.code === "UNAUTHENTICATED";
}

/** Where to send someone whose session can't be renewed (keeps the page they were on). */
export function signInUrl(returnTo?: string): string {
  return returnTo && returnTo !== "/"
    ? `/sign-in?returnTo=${encodeURIComponent(returnTo)}`
    : "/sign-in";
}

export type ProviderId = "google" | "github" | "test";

/** Button labels; both apps use the same accessible names (packages/e2e relies on them). */
export const PROVIDER_LABELS: Record<ProviderId, string> = {
  google: "Continue with Google",
  github: "Continue with GitHub",
  test: "Continue with test provider",
};

export const PROVIDER_NAMES = { GOOGLE: "Google", GITHUB: "GitHub", TEST: "Test" } as const;

/** Plain-language messages for /sign-in?error=… (contracts/auth-rest.md). */
export const SIGN_IN_ERRORS: Record<string, string> = {
  denied: "Sign-in was cancelled. You can try again whenever you're ready.",
  invite_only: "This app is invite-only, and this account isn't on the list.",
  expired: "That sign-in took too long or was already used. Please try again.",
  bot: "We couldn't confirm you're not a bot. Please try again.",
  rate_limited: "Too many sign-in attempts. Please wait a minute and try again.",
  unavailable: "That sign-in option isn't available right now. Try another one.",
  failed: "Sign-in didn't work. Please try again.",
};

export const SIGN_IN_NOTICES: Record<string, string> = {
  signedOut: "You're signed out.",
  deleted: "Your account and all of its notes were permanently deleted.",
};

export function signInMessages(params: Record<string, string | string[] | undefined>): {
  error?: string;
  notice?: string;
} {
  const error = typeof params.error === "string" ? params.error : undefined;
  return {
    error: error ? (SIGN_IN_ERRORS[error] ?? SIGN_IN_ERRORS.failed) : undefined,
    notice:
      params.deleted === "1"
        ? SIGN_IN_NOTICES.deleted
        : params.signedOut === "1"
          ? SIGN_IN_NOTICES.signedOut
          : undefined,
  };
}

/** Only same-site relative paths (mirrors the API's check), so returnTo can't redirect away. */
export function safeReturnTo(value: unknown): string {
  return typeof value === "string" &&
    value.length <= 512 &&
    /^\/(?![/\\])[^\s\\]*$/.test(value) &&
    !value.startsWith("/sign-in")
    ? value
    : "/";
}
