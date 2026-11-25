import { createHash, randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { CacheService } from "../../cache/cache.service";
import type { Env } from "../../config/env";
import {
  type AuthorizationRequest,
  type CodeExchange,
  type OAuthProvider,
  ProviderError,
  type ProviderIdentity,
  truncate,
} from "./provider";

const CODE_TTL_SECONDS = 60;
const LOGIN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

interface StoredCode {
  login: string;
  email?: string;
  codeChallenge: string;
  redirectUri: string;
}

/**
 * Test-only stand-in for Google/GitHub (research D12). Speaks the same Authorization Code + PKCE
 * flow through an HTML form served by the API, so e2e tests exercise state, PKCE, the callback,
 * cookies and the allowlist. Enabled only with AUTH_TEST_PROVIDER=enabled and APP_ENV other than
 * production (env.ts refuses to boot otherwise).
 */
@Injectable()
export class TestProvider implements OAuthProvider {
  readonly id = "test" as const;
  readonly enabled: boolean;

  constructor(
    config: ConfigService<Env, true>,
    private readonly cache: CacheService,
  ) {
    this.enabled =
      config.get("AUTH_TEST_PROVIDER", { infer: true }) === "enabled" &&
      config.get("APP_ENV", { infer: true }) !== "production";
  }

  isConfiguredFor(): boolean {
    return this.enabled;
  }

  authorizationUrl({ state, codeVerifier, redirectUri, origin }: AuthorizationRequest): URL {
    const url = new URL("/api/auth/test/authorize", origin);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "test");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", s256(codeVerifier));
    url.searchParams.set("code_challenge_method", "S256");
    return url;
  }

  /** Called by the test authorize form: remembers who "signed in" and returns a one-time code. */
  async issueCode(input: StoredCode): Promise<string> {
    if (!this.enabled) throw new ProviderError("Test provider disabled");
    if (!LOGIN.test(input.login)) throw new ProviderError("Invalid test login", "failed");
    const code = randomBytes(24).toString("base64url");
    await this.cache.client.set(
      `auth:testcode:${code}`,
      JSON.stringify(input),
      "EX",
      CODE_TTL_SECONDS,
    );
    return code;
  }

  async identify({ code, codeVerifier, redirectUri }: CodeExchange): Promise<ProviderIdentity> {
    if (!this.enabled) throw new ProviderError("Test provider disabled");
    const raw = await this.cache.client.getdel(`auth:testcode:${code}`);
    if (!raw) throw new ProviderError("Unknown or used test code", "failed");
    const stored = JSON.parse(raw) as StoredCode;
    if (stored.redirectUri !== redirectUri || stored.codeChallenge !== s256(codeVerifier)) {
      throw new ProviderError("Test code does not match this sign-in", "failed");
    }
    const login = stored.login.toLowerCase();
    return {
      provider: "TEST",
      providerAccountId: login,
      displayName: truncate(login, 200),
      login,
      email: stored.email?.toLowerCase() || undefined,
    };
  }
}

export function s256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
