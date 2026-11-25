import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Google } from "arctic";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

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

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
// Fixed URL (OWASP A10); jose caches the keys and refetches on rotation.
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

/** Google (OpenID Connect): arctic for the OAuth flow, jose to verify the id_token (research D8). */
@Injectable()
export class GoogleProvider implements OAuthProvider {
  readonly id = "google" as const;
  private readonly clientId?: string;
  private readonly clientSecret?: string;

  /** Google's signing keys; tests replace it with a local key set. */
  jwks: JWTVerifyGetKey = GOOGLE_JWKS;

  constructor(config: ConfigService<Env, true>) {
    this.clientId = config.get("GOOGLE_CLIENT_ID", { infer: true });
    this.clientSecret = config.get("GOOGLE_CLIENT_SECRET", { infer: true });
  }

  isConfiguredFor(): boolean {
    return !!this.clientId && !!this.clientSecret;
  }

  private client(redirectUri: string): Google {
    if (!this.clientId || !this.clientSecret) throw new ProviderError("Google is not configured");
    return new Google(this.clientId, this.clientSecret, redirectUri);
  }

  authorizationUrl({ state, codeVerifier, redirectUri }: AuthorizationRequest): URL {
    const url = this.client(redirectUri).createAuthorizationURL(state, codeVerifier, [
      "openid",
      "email",
      "profile",
    ]);
    url.searchParams.set("prompt", "select_account");
    return url;
  }

  async identify({ code, codeVerifier, redirectUri }: CodeExchange): Promise<ProviderIdentity> {
    let idToken: string;
    try {
      const tokens = await this.client(redirectUri).validateAuthorizationCode(code, codeVerifier);
      idToken = tokens.idToken();
    } catch (err) {
      throw new ProviderError(`Google code exchange failed: ${(err as Error).name}`, "failed");
    }
    return this.identityFromIdToken(idToken);
  }

  async identityFromIdToken(idToken: string): Promise<ProviderIdentity> {
    let claims: Record<string, unknown>;
    try {
      ({ payload: claims } = await jwtVerify(idToken, this.jwks, {
        issuer: GOOGLE_ISSUERS,
        audience: this.clientId,
      }));
    } catch (err) {
      throw new ProviderError(`Google id_token rejected: ${(err as Error).name}`, "failed");
    }
    if (typeof claims.sub !== "string" || !claims.sub) {
      throw new ProviderError("Google id_token without sub", "failed");
    }
    const email =
      claims.email_verified === true && typeof claims.email === "string" ? claims.email : undefined;
    const name = typeof claims.name === "string" && claims.name.trim() ? claims.name.trim() : null;
    return {
      provider: "GOOGLE",
      providerAccountId: claims.sub,
      displayName: truncate(name ?? email ?? "Google user", 200),
      email,
      avatarUrl: safeAvatarUrl(claims.picture),
    };
  }
}
