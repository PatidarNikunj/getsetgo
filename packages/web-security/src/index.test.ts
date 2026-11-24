import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy, createNonce, securityHeaders } from "./index";

const parse = (csp: string) =>
  Object.fromEntries(
    csp.split("; ").map((d) => {
      const [name, ...sources] = d.split(" ");
      return [name, sources];
    }),
  );

describe("buildContentSecurityPolicy", () => {
  it("is strict in production", () => {
    const csp = parse(buildContentSecurityPolicy({ nonce: "abc", isDev: false }));
    expect(csp["script-src"]).toEqual(["'self'", "'nonce-abc'", "'strict-dynamic'"]);
    expect(csp["script-src"]).not.toContain("'unsafe-inline'");
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    expect(csp["upgrade-insecure-requests"]).toEqual([]);
    expect(csp["style-src"]).toEqual(["'self'", "'nonce-abc'"]);
  });

  it("allows eval and websockets only in development", () => {
    const csp = parse(buildContentSecurityPolicy({ nonce: "abc", isDev: true }));
    expect(csp["script-src"]).toContain("'unsafe-eval'");
    expect(csp["connect-src"]).toContain("ws:");
    // Dev server injects un-nonced <style> tags; scripts stay nonce-only.
    expect(csp["style-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(csp["script-src"]).not.toContain("'unsafe-inline'");
    expect(csp["upgrade-insecure-requests"]).toBeUndefined();
  });

  it("adds extra origins", () => {
    const csp = parse(
      buildContentSecurityPolicy({
        nonce: "n",
        isDev: false,
        extra: {
          "connect-src": ["https://o1.ingest.sentry.io"],
          "frame-src": ["https://www.google.com"],
        },
      }),
    );
    expect(csp["connect-src"]).toEqual(["'self'", "https://o1.ingest.sentry.io"]);
    expect(csp["frame-src"]).toEqual(["https://www.google.com"]);
  });
});

describe("createNonce", () => {
  it("is random and base64", () => {
    const a = createNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(a).not.toBe(createNonce());
  });
});

describe("securityHeaders", () => {
  it("adds HSTS only in production", () => {
    const keys = (isDev: boolean) => securityHeaders({ isDev }).map((h) => h.key);
    expect(keys(false)).toContain("Strict-Transport-Security");
    expect(keys(true)).not.toContain("Strict-Transport-Security");
  });
});
