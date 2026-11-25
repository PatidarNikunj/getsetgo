/**
 * Sentry must start before anything else is imported, so it can instrument HTTP, GraphQL,
 * Prisma and outgoing fetch calls. main.ts imports this file first. Disabled without SENTRY_DSN.
 */
import { existsSync } from "node:fs";

import * as Sentry from "@sentry/nestjs";

import { scrubAuthUrls, scrubSensitive } from "./observability/scrub";

// ConfigModule loads .env later; Sentry needs SENTRY_DSN now (local development only).
if (process.env.NODE_ENV !== "production" && existsSync(".env")) process.loadEnvFile(".env");

const dsn = process.env.SENTRY_DSN;
const rate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.2");

Sentry.init({
  dsn: dsn || undefined,
  enabled: !!dsn,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
  release: process.env.SENTRY_RELEASE || undefined,
  tracesSampleRate: Number.isFinite(rate) ? Math.min(Math.max(rate, 0), 1) : 0.2,
  // Sentry 11 collects cookies, headers and bodies by default: turn that off (OWASP A09).
  // Keep in sync with sentryDataCollection in @getsetgo/observability.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: {
      request: { allow: ["user-agent", "content-type", "x-request-id", "sentry-trace", "baggage"] },
      response: false,
    },
    httpBodies: [],
    urlQueryParams: false,
    // Query names are useful; variables carry note text.
    graphQL: { document: true, variables: false },
    genAI: { inputs: false, outputs: false },
    mcp: { inputs: false, outputs: false },
    databaseQueryData: false,
    queues: false,
    stackFrameVariables: false,
  },
  // Continue the trace into apps/ai only (sentry-trace + baggage headers), not to third parties.
  tracePropagationTargets: [process.env.AI_SERVICE_URL ?? "http://localhost:8000"],
  beforeSend: (event) => scrubSensitive(scrubAuthUrls(event)),
  beforeSendTransaction: (event) => scrubSensitive(event),
});
