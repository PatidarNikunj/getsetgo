import { securityHeaders } from "@getsetgo/web-security";
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
  transpilePackages: ["@getsetgo/graphql", "@getsetgo/ui-tokens", "@getsetgo/web-security"],
  // Same-origin API: cookies stay first-party for the upcoming login, and no CORS is needed.
  async rewrites() {
    return [{ source: "/api/graphql", destination: `${apiUrl}/graphql` }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders({ isDev }) }];
  },
};

export default nextConfig;
