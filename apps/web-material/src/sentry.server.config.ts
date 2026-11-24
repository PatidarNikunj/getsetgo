import { sentryOptions } from "@getsetgo/observability";
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  ...sentryOptions({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  }),
  // Answers the browser SDK's `tunnel: true` requests and forwards them to Sentry (without the
  // visitor's cookies or headers).
  integrations: [Sentry.serveTunnelIntegration()],
  // Server-side GraphQL fetches go straight to the API: continue the trace there.
  tracePropagationTargets: [process.env.API_URL ?? "http://localhost:4000"],
});
