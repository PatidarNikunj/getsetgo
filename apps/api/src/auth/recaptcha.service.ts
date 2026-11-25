import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../config/env";

const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify"; // fixed (OWASP A10)
export const RECAPTCHA_ACTION = "sign_in";

interface SiteverifyResponse {
  success: boolean;
  score?: number;
  action?: string;
  hostname?: string;
}

/**
 * reCAPTCHA v3 (invisible, no puzzles: WCAG 3.3.8) on sign-in start (research D9). Skipped when
 * no secret is configured (local development and tests).
 */
@Injectable()
export class RecaptchaService {
  private readonly logger = new Logger(RecaptchaService.name);
  private readonly secret?: string;
  private readonly minScore: number;
  private readonly hostnames: Set<string>;

  /** Replaceable in tests. */
  fetchFn: typeof fetch = (input, init) => fetch(input, init);

  constructor(config: ConfigService<Env, true>) {
    this.secret = config.get("RECAPTCHA_SECRET_KEY", { infer: true });
    this.minScore = config.get("RECAPTCHA_MIN_SCORE", { infer: true });
    this.hostnames = new Set(
      config.get("CORS_ORIGINS", { infer: true }).map((origin) => new URL(origin).hostname),
    );
  }

  get enabled(): boolean {
    return !!this.secret;
  }

  /** true = looks human (or the check is off). */
  async verify(token: unknown, remoteIp?: string): Promise<boolean> {
    if (!this.secret) return true;
    if (typeof token !== "string" || token.length === 0 || token.length > 4096) return false;
    try {
      const body = new URLSearchParams({ secret: this.secret, response: token });
      if (remoteIp) body.set("remoteip", remoteIp);
      const res = await this.fetchFn(VERIFY_URL, {
        method: "POST",
        body,
        signal: AbortSignal.timeout(5000),
      });
      const result = (await res.json()) as SiteverifyResponse;
      return (
        result.success &&
        result.action === RECAPTCHA_ACTION &&
        (result.score ?? 0) >= this.minScore &&
        !!result.hostname &&
        this.hostnames.has(result.hostname)
      );
    } catch (err) {
      // Fail closed, but say why in the logs (never the token).
      this.logger.warn(`reCAPTCHA verification failed: ${(err as Error).message}`);
      return false;
    }
  }
}
