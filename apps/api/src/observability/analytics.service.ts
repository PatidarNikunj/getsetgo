import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

import type { Env } from "../config/env";
import { gaClientId, hasAnalyticsConsent } from "./consent";

type EventParams = Record<string, string | number | boolean>;

/**
 * Server-side Google Analytics events (GA4 Measurement Protocol). An event is sent only when:
 * GA is configured, the visitor accepted analytics (consent cookie) and GA has identified them
 * (`_ga` cookie). Never include note content or other personal data in params.
 * Fire-and-forget: analytics problems never affect the API response.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly measurementId?: string;
  private readonly apiSecret?: string;
  private readonly endpoint: string;

  constructor(config: ConfigService<Env, true>) {
    this.measurementId = config.get("GA_MEASUREMENT_ID", { infer: true });
    this.apiSecret = config.get("GA_API_SECRET", { infer: true });
    this.endpoint = config.get("GA_MP_ENDPOINT", { infer: true });
  }

  get enabled(): boolean {
    return !!this.measurementId && !!this.apiSecret;
  }

  track(req: Request | undefined, name: string, params: EventParams = {}): void {
    if (!this.enabled || !req) return;
    const cookies = req.headers.cookie;
    if (!hasAnalyticsConsent(cookies)) return;
    const clientId = gaClientId(cookies);
    if (!clientId) return;

    const url = new URL(this.endpoint);
    url.searchParams.set("measurement_id", this.measurementId!);
    url.searchParams.set("api_secret", this.apiSecret!);

    void fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: clientId, events: [{ name, params }] }),
      signal: AbortSignal.timeout(3000),
    })
      .then((res) => {
        if (!res.ok) this.logger.warn(`GA event ${name} rejected (${res.status})`);
      })
      .catch((err: Error) => this.logger.warn(`GA event ${name} failed: ${err.message}`));
  }
}
