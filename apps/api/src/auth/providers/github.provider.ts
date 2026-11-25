import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CodeChallengeMethod, OAuth2Client } from "arctic";

import type { Env } from "../../config/env";
import {
  type AuthorizationRequest,
  type CodeExchange,
  type OAuthProvider,
  ProviderError,
  type ProviderIdentity,
  safeAvatarUrl,
  truncate,
} from "./provider";

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const API = "https://api.github.com";

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

/**
 * GitHub (plain OAuth 2.0, not OpenID Connect). arctic's generic client is used so the flow also
 * gets PKCE (arctic's GitHub class has none). GitHub OAuth apps allow one callback URL, so each
 * web app origin has its own app (GITHUB_OAUTH_APPS).
 */
@Injectable()
export class GitHubProvider implements OAuthProvider {
  readonly id = "github" as const;
  private readonly apps: Env["GITHUB_OAUTH_APPS"];

  /** Replaceable in tests. */
  fetchFn: typeof fetch = (input, init) => fetch(input, init);

  constructor(config: ConfigService<Env, true>) {
    this.apps = config.get("GITHUB_OAUTH_APPS", { infer: true });
  }

  isConfiguredFor(origin: string): boolean {
    return origin in this.apps;
  }

  private client(origin: string, redirectUri: string): OAuth2Client {
    const app = this.apps[origin];
    if (!app) throw new ProviderError("GitHub is not configured for this origin");
    return new OAuth2Client(app.clientId, app.clientSecret, redirectUri);
  }

  authorizationUrl({ state, codeVerifier, redirectUri, origin }: AuthorizationRequest): URL {
    const url = this.client(origin, redirectUri).createAuthorizationURLWithPKCE(
      AUTHORIZE_URL,
      state,
      CodeChallengeMethod.S256,
      codeVerifier,
      ["read:user", "user:email"],
    );
    url.searchParams.set("allow_signup", "false");
    return url;
  }

  async identify({
    code,
    codeVerifier,
    redirectUri,
    origin,
  }: CodeExchange): Promise<ProviderIdentity> {
    let accessToken: string;
    try {
      const tokens = await this.client(origin, redirectUri).validateAuthorizationCode(
        TOKEN_URL,
        code,
        codeVerifier,
      );
      accessToken = tokens.accessToken();
    } catch (err) {
      throw new ProviderError(`GitHub code exchange failed: ${(err as Error).name}`, "failed");
    }
    const user = await this.get<GitHubUser>("/user", accessToken);
    if (typeof user.id !== "number" || typeof user.login !== "string") {
      throw new ProviderError("Unexpected GitHub user response", "failed");
    }
    const emails = await this.get<GitHubEmail[]>("/user/emails", accessToken).catch(() => []);
    const verified = Array.isArray(emails)
      ? emails.find((e) => e.primary && e.verified)
      : undefined;
    const name = user.name?.trim();
    return {
      provider: "GITHUB",
      providerAccountId: String(user.id),
      displayName: truncate(name || user.login, 200),
      login: truncate(user.login, 100),
      email: verified?.email,
      avatarUrl: safeAvatarUrl(user.avatar_url),
    };
  }

  private async get<T>(path: string, accessToken: string): Promise<T> {
    const res = await this.fetchFn(`${API}${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "getsetgo",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new ProviderError(`GitHub ${path} answered ${res.status}`);
    return (await res.json()) as T;
  }
}
