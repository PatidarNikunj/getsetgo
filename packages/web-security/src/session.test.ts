import { describe, expect, it, vi } from "vitest";

import { buildContentSecurityPolicy, mergeCspSources } from "./index";
import {
  cookiesFromSetCookie,
  jwtExpiresWithin,
  recaptchaCspSources,
  renewSession,
  signInCspSources,
  withCookies,
} from "./session";

const jwt = (exp: number) =>
  `h.${btoa(JSON.stringify({ exp })).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")}.s`;

describe("session helpers", () => {
  it("decides when an access token needs renewal", () => {
    const now = 1_000_000_000_000;
    expect(jwtExpiresWithin(jwt(now / 1000 + 600), 60, now)).toBe(false);
    expect(jwtExpiresWithin(jwt(now / 1000 + 30), 60, now)).toBe(true);
    expect(jwtExpiresWithin("garbage", 60, now)).toBe(true);
  });

  it("reads cookies from Set-Cookie lines and rewrites a Cookie header", () => {
    expect(
      cookiesFromSetCookie(["a=1; Path=/; HttpOnly", "b=; Expires=Thu, 01 Jan 1970 00:00:00 GMT"]),
    ).toEqual({ a: "1", b: "" });
    expect(withCookies("x=1; a=old; b=2", { a: "new", b: "" })).toBe("x=1; a=new");
  });

  it("renews through the API and passes cookies on", async () => {
    const headers = new Headers();
    headers.append("set-cookie", "__Host-gsg_at=new; Path=/");
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 204, headers }));
    const result = await renewSession({
      apiUrl: "http://api",
      refreshCookie: "__Host-gsg_rt=r",
      origin: "http://localhost:3000",
      fetchFn,
    });
    expect(result).toEqual({ ok: true, setCookies: ["__Host-gsg_at=new; Path=/"] });
    expect(fetchFn).toHaveBeenCalledWith(
      "http://api/auth/refresh",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ origin: "http://localhost:3000" }),
      }),
    );
    fetchFn.mockRejectedValue(new Error("down"));
    expect(
      (await renewSession({ apiUrl: "http://api", refreshCookie: "r=1", origin: "o", fetchFn })).ok,
    ).toBe(false);
  });

  it("passes extra headers (the signed visitor IP) without letting them replace the cookie", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    await renewSession({
      apiUrl: "http://api",
      refreshCookie: "__Host-gsg_rt=r",
      origin: "http://localhost:3000",
      headers: { "x-getsetgo-client-ip": "203.0.113.7", cookie: "evil=1" },
      fetchFn,
    });
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({
      "x-getsetgo-client-ip": "203.0.113.7",
      cookie: "__Host-gsg_rt=r",
    });
  });

  it("adds sign-in and reCAPTCHA sources to the CSP", () => {
    const csp = buildContentSecurityPolicy({
      nonce: "n",
      isDev: false,
      extra: mergeCspSources(signInCspSources(), recaptchaCspSources("key"), {
        "script-src": ["https://www.google.com/recaptcha/"],
      }),
    });
    expect(csp).toContain("form-action 'self' https://accounts.google.com https://github.com");
    expect(csp).toMatch(/script-src [^;]*https:\/\/www\.gstatic\.com\/recaptcha\//);
    expect(csp.match(/https:\/\/www\.google\.com\/recaptcha\//g)?.length).toBe(3);
    expect(recaptchaCspSources(undefined)).toEqual({});
  });
});
