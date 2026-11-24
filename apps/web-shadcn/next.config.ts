import { securityHeaders } from "@getsetgo/web-security";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
// Where the GraphQL API lives. Server-side only: the browser always calls /api/graphql here.
const apiUrl = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  // Off on purpose: Partial Prerendering serves a prebuilt shell whose scripts can't carry the
  // per-request CSP nonce, so a strict CSP would block them. Every page renders per request.
  cacheComponents: false,
  reactCompiler: true,
  poweredByHeader: false,
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: [
    "@getsetgo/consent",
    "@getsetgo/drafts",
    "@getsetgo/graphql",
    "@getsetgo/observability",
    "@getsetgo/ui-tokens",
    "@getsetgo/web-security",
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Same-origin API: cookies stay first-party for the upcoming login, and no CORS is needed.
  async rewrites() {
    return [{ source: "/api/graphql", destination: `${apiUrl}/graphql` }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders({ isDev }) }];
  },
};

// Uploads source maps to Sentry at build time when SENTRY_AUTH_TOKEN is set (CI/Vercel);
// otherwise it only wires up the SDK. Sentry's own build telemetry is off.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
