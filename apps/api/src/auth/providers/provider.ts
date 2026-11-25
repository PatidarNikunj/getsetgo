import type { AuthProvider } from "../../generated/prisma/enums";

export const PROVIDER_IDS = ["google", "github", "test"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

/** Who the provider says signed in. `email` is set only if the provider verified it. */
export interface ProviderIdentity {
  provider: AuthProvider;
  providerAccountId: string;
  displayName: string;
  email?: string;
  login?: string;
  avatarUrl?: string;
}

export interface AuthorizationRequest {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  /** The web app origin the sign-in started from (validated). */
  origin: string;
}

export interface CodeExchange {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  origin: string;
}

/** One OAuth 2.0 provider: Authorization Code + PKCE (S256) + state (research D1, D7). */
export interface OAuthProvider {
  readonly id: ProviderId;
  isConfiguredFor(origin: string): boolean;
  authorizationUrl(request: AuthorizationRequest): URL;
  identify(exchange: CodeExchange): Promise<ProviderIdentity>;
}

/** Thrown when a provider call fails; the user sees "provider unavailable", never the details. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly reason: "unavailable" | "failed" = "unavailable",
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Only https avatar links are kept (they're shown as images; never fetched by the server). */
export function safeAvatarUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  try {
    return new URL(value).protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
}

export function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}
