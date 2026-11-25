import type { ConfigService } from "@nestjs/config";
import { SignJWT } from "jose";

import type { Env } from "../config/env";
import { hashToken, TokensService } from "./tokens.service";

const secret = "s".repeat(32);
const config = { get: () => secret } as unknown as ConfigService<Env, true>;

describe("TokensService", () => {
  const tokens = new TokensService(config);

  it("signs and verifies an access token", async () => {
    const jwt = await tokens.signAccessToken({ userId: "u1", sessionId: "s1" });
    await expect(tokens.verifyAccessToken(jwt)).resolves.toEqual({ userId: "u1", sessionId: "s1" });
  });

  it("rejects tokens signed with another key, for another audience, or expired", async () => {
    const other = new TokensService({ get: () => "o".repeat(32) } as never);
    const foreign = await other.signAccessToken({ userId: "u1", sessionId: "s1" });
    await expect(tokens.verifyAccessToken(foreign)).resolves.toBeUndefined();

    const key = new TextEncoder().encode(secret);
    const wrongAud = await new SignJWT({ sid: "s1" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .setIssuer("getsetgo-api")
      .setAudience("getsetgo-ai")
      .setExpirationTime("5m")
      .sign(key);
    await expect(tokens.verifyAccessToken(wrongAud)).resolves.toBeUndefined();

    const expired = await new SignJWT({ sid: "s1" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .setIssuer("getsetgo-api")
      .setAudience("getsetgo-web")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(key);
    await expect(tokens.verifyAccessToken(expired)).resolves.toBeUndefined();
    await expect(tokens.verifyAccessToken("garbage")).resolves.toBeUndefined();
  });

  it("creates random refresh tokens and stores only a SHA-256 hash", () => {
    const a = tokens.createRefreshToken();
    const b = tokens.createRefreshToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).toBe(hashToken(a.token));
    expect(a.hash).not.toContain(a.token);
  });
});
