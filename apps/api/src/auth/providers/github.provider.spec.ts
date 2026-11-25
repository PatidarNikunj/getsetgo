import type { ConfigService } from "@nestjs/config";

import type { Env } from "../../config/env";
import { GitHubProvider } from "./github.provider";

const apps = { "http://localhost:3000": { clientId: "gh-1", clientSecret: "s" } };
const config = { get: () => apps } as unknown as ConfigService<Env, true>;

describe("GitHubProvider", () => {
  const provider = new GitHubProvider(config);

  it("is configured per web app origin", () => {
    expect(provider.isConfiguredFor("http://localhost:3000")).toBe(true);
    expect(provider.isConfiguredFor("http://localhost:3001")).toBe(false);
  });

  it("uses PKCE (S256) and state", () => {
    const url = provider.authorizationUrl({
      state: "st",
      codeVerifier: "v".repeat(43),
      redirectUri: "http://localhost:3000/api/auth/github/callback",
      origin: "http://localhost:3000",
    });
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("gh-1");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("state")).toBe("st");
  });

  it("maps the user and keeps only the primary verified email", async () => {
    const responses: Record<string, unknown> = {
      "https://github.com/login/oauth/access_token": {
        access_token: "gho_x",
        token_type: "bearer",
      },
      "https://api.github.com/user": {
        id: 42,
        login: "OctoCat",
        name: " ",
        avatar_url: "https://a",
      },
      "https://api.github.com/user/emails": [
        { email: "old@example.com", primary: false, verified: true },
        { email: "octo@example.com", primary: true, verified: true },
      ],
    };
    const fake = jest.fn((input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : input.toString();
      return Promise.resolve(
        Response.json(responses[url] ?? {}, { status: url in responses ? 200 : 404 }),
      );
    });
    // arctic's token request uses the global fetch; API calls use fetchFn.
    const realFetch = global.fetch;
    global.fetch = fake as unknown as typeof fetch;
    provider.fetchFn = fake as unknown as typeof fetch;
    try {
      const identity = await provider.identify({
        code: "c",
        codeVerifier: "v".repeat(43),
        redirectUri: "http://localhost:3000/api/auth/github/callback",
        origin: "http://localhost:3000",
      });
      expect(identity).toEqual({
        provider: "GITHUB",
        providerAccountId: "42",
        displayName: "OctoCat",
        login: "OctoCat",
        email: "octo@example.com",
        avatarUrl: "https://a",
      });
    } finally {
      global.fetch = realFetch;
    }
  });
});
