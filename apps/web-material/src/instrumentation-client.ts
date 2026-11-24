// Browser Sentry: errors + performance. Off without NEXT_PUBLIC_SENTRY_DSN.
import { sentryOptions } from "@getsetgo/observability";
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  ...sentryOptions({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  }),
  // Send events to this app's own server, which forwards them to Sentry: no third-party
  // connect-src in the CSP, and ad blockers can't drop them.
  tunnel: true,
  // Continue the trace into the API (browser → /api/graphql → NestJS → FastAPI).
  tracePropagationTargets: [/^\/api\/graphql/],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
