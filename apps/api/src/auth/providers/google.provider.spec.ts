import type { ConfigService } from "@nestjs/config";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

import type { Env } from "../../config/env";
import { GoogleProvider } from "./google.provider";
import { ProviderError } from "./provider";

const config = {
  get: (key: string) => ({ GOOGLE_CLIENT_ID: "client-1", GOOGLE_CLIENT_SECRET: "secret" })[key],
} as unknown as ConfigService<Env, true>;

describe("GoogleProvider", () => {
  let provider: GoogleProvider;
  let sign: (claims: Record<string, unknown>, aud?: string, iss?: string) => Promise<string>;

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
    provider = new GoogleProvider(config);
    provider.jwks = createLocalJWKSet({ keys: [jwk] });
    sign = (claims, aud = "client-1", iss = "https://accounts.google.com") =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuer(iss)
        .setAudience(aud)
        .setExpirationTime("5m")
        .sign(privateKey);
  });

  it("builds a PKCE authorization URL with state", () => {
    const url = provider.authorizationUrl({
      state: "st",
      codeVerifier: "v".repeat(43),
      redirectUri: "http://localhost:3000/api/auth/google/callback",
      origin: "http://localhost:3000",
    });
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/google/callback",
    );
  });

  it("reads a verified identity from a valid id_token", async () => {
    const token = await sign({
      sub: "g-123",
      email: "Alice@Example.com",
      email_verified: true,
      name: "Alice",
      picture: "https://lh3.googleusercontent.com/a",
    });
    await expect(provider.identityFromIdToken(token)).resolves.toEqual({
      provider: "GOOGLE",
      providerAccountId: "g-123",
      displayName: "Alice",
      email: "Alice@Example.com",
      avatarUrl: "https://lh3.googleusercontent.com/a",
    });
  });

  it("drops unverified emails and non-https avatars", async () => {
    const token = await sign({
      sub: "g-1",
      email: "x@y.z",
      email_verified: false,
      picture: "http://a",
    });
    const identity = await provider.identityFromIdToken(token);
    expect(identity.email).toBeUndefined();
    expect(identity.avatarUrl).toBeUndefined();
    expect(identity.displayName).toBe("Google user");
  });

  it("rejects tokens for another client or issuer", async () => {
    await expect(provider.identityFromIdToken(await sign({ sub: "g" }, "other"))).rejects.toThrow(
      ProviderError,
    );
    await expect(
      provider.identityFromIdToken(await sign({ sub: "g" }, "client-1", "https://evil.example")),
    ).rejects.toThrow(ProviderError);
  });
});
