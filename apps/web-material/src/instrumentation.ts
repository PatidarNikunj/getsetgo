// Server-side Sentry for the Next.js server (rendering, the proxy, route handlers).
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
}

// Reports errors thrown while rendering Server Components and route handlers.
export const onRequestError = Sentry.captureRequestError;
