import { createHash, randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { jwtVerify, SignJWT } from "jose";

import type { Env } from "../config/env";
import { ACCESS_TTL_SECONDS } from "./cookies";

export const ACCESS_ISSUER = "getsetgo-api";
export const ACCESS_AUDIENCE = "getsetgo-web";

export interface AccessClaims {
  userId: string;
  sessionId: string;
}

/** Access JWTs (jose, HS256) and opaque refresh tokens (research D3, D4). */
@Injectable()
export class TokensService {
  private readonly key: Uint8Array;

  constructor(config: ConfigService<Env, true>) {
    this.key = new TextEncoder().encode(config.get("AUTH_JWT_SECRET", { infer: true }));
  }

  signAccessToken({ userId, sessionId }: AccessClaims): Promise<string> {
    return new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(userId)
      .setIssuer(ACCESS_ISSUER)
      .setAudience(ACCESS_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
      .sign(this.key);
  }

  /** Returns the claims, or undefined for anything invalid (bad signature, expired, wrong aud…). */
  async verifyAccessToken(token: string): Promise<AccessClaims | undefined> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ["HS256"],
        issuer: ACCESS_ISSUER,
        audience: ACCESS_AUDIENCE,
      });
      if (typeof payload.sub !== "string" || typeof payload.sid !== "string") return undefined;
      return { userId: payload.sub, sessionId: payload.sid };
    } catch {
      return undefined;
    }
  }

  /** 256 random bits; the browser keeps the token, the database keeps only its hash. */
  createRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString("base64url");
    return { token, hash: hashToken(token) };
  }
}

/** SHA-256 hex. Enough for high-entropy random tokens (a slow password hash isn't needed). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
