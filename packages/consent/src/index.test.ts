import { describe, expect, it } from "vitest";

import {
  consentCookieString,
  consentFromCookieHeader,
  createConsent,
  gaClientIdFromCookieHeader,
  hasAnalyticsConsent,
  parseConsent,
  serializeConsent,
} from "./index";

const now = new Date("2026-11-24T10:00:00.000Z");

describe("consent cookie", () => {
  it("round-trips", () => {
    const consent = createConsent(true, now);
    expect(serializeConsent(consent)).toBe("1.a1.2026-11-24T10:00:00.000Z");
    expect(parseConsent(serializeConsent(consent))).toEqual(consent);
  });

  it.each([
    undefined,
    "",
    "garbage",
    "2.a1.2026-11-24T10:00:00.000Z",
    "1.a2.2026-11-24T10:00:00.000Z",
    "1.a1.not-a-date",
  ])("treats %o as no decision", (value) => {
    expect(parseConsent(value)).toBeNull();
  });

  it("is read from a Cookie header among other cookies", () => {
    const header = `theme=dark; gsg_consent=${encodeURIComponent("1.a0.2026-11-24T10:00:00.000Z")}; other=1`;
    expect(consentFromCookieHeader(header)?.analytics).toBe(false);
    expect(hasAnalyticsConsent(header)).toBe(false);
    expect(hasAnalyticsConsent("gsg_consent=1.a1.2026-11-24T10:00:00.000Z")).toBe(true);
    expect(hasAnalyticsConsent(undefined)).toBe(false);
  });

  it("builds a SameSite=Lax cookie, Secure on HTTPS", () => {
    const cookie = consentCookieString(createConsent(true, now), { secure: true });
    expect(cookie).toContain("gsg_consent=1.a1.");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(consentCookieString(createConsent(false, now), { secure: false })).not.toContain(
      "Secure",
    );
  });
});

describe("gaClientIdFromCookieHeader", () => {
  it("extracts the client id from _ga", () => {
    expect(gaClientIdFromCookieHeader("_ga=GA1.1.123456789.1700000000")).toBe(
      "123456789.1700000000",
    );
    expect(gaClientIdFromCookieHeader("_ga=bogus")).toBeUndefined();
    expect(gaClientIdFromCookieHeader(undefined)).toBeUndefined();
  });
});
