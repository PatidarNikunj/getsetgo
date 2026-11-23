import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SignJWT } from "jose";

import type { Env } from "../config/env";
import type { components } from "./ai-api";

export type SummaryRequest = components["schemas"]["SummaryRequest"];
export type SummaryResponse = components["schemas"]["SummaryResponse"];

/** Why the AI service couldn't summarize; mapped to a user-facing GraphQL error by the caller. */
export class AiServiceError extends Error {
  constructor(
    message: string,
    readonly kind: "refused" | "unavailable" | "failed",
  ) {
    super(message);
  }
}

const TOKEN_TTL_SECONDS = 60;
const REQUEST_TIMEOUT_MS = 90_000;

/**
 * Typed client for apps/ai. Every call carries a fresh, short-lived service JWT (HS256) that
 * apps/ai verifies; the request ID is forwarded so logs line up across services.
 */
@Injectable()
export class AiClientService {
  private readonly logger = new Logger(AiClientService.name);
  private readonly baseUrl: string;
  private readonly secret: Uint8Array;

  constructor(config: ConfigService<Env, true>) {
    this.baseUrl = config.get("AI_SERVICE_URL", { infer: true }).replace(/\/$/, "");
    this.secret = new TextEncoder().encode(config.get("SERVICE_JWT_SECRET", { infer: true }));
  }

  private signToken(): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("getsetgo-api")
      .setAudience("getsetgo-ai")
      .setSubject("getsetgo-api")
      .setIssuedAt()
      .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
      .sign(this.secret);
  }

  async summarize(body: SummaryRequest, requestId?: string): Promise<SummaryResponse> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${await this.signToken()}`,
    };
    if (requestId) headers["x-request-id"] = requestId;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/summaries`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.warn(`AI service unreachable: ${(err as Error).message}`);
      throw new AiServiceError("The AI service is unavailable. Try again later.", "unavailable");
    }

    if (response.ok) return (await response.json()) as SummaryResponse;

    this.logger.warn(`AI service returned ${response.status}`);
    if (response.status === 422) {
      throw new AiServiceError("This note couldn't be summarized.", "refused");
    }
    if (response.status === 503) {
      throw new AiServiceError("The AI service is unavailable. Try again later.", "unavailable");
    }
    throw new AiServiceError("Summarizing failed. Try again later.", "failed");
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }
}
