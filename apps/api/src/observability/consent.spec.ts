import { consentCookieString, createConsent } from "@getsetgo/consent";

import { gaClientId, hasAnalyticsConsent } from "./consent";

const cookieFrom = (analytics: boolean) =>
  consentCookieString(createConsent(analytics), { secure: false }).split(";")[0]!;

describe("API consent parser (must agree with @getsetgo/consent)", () => {
  it("reads the cookie the web apps write", () => {
    expect(hasAnalyticsConsent(`other=1; ${cookieFrom(true)}`)).toBe(true);
    expect(hasAnalyticsConsent(cookieFrom(false))).toBe(false);
  });

  it("treats missing or unknown versions as no consent", () => {
    expect(hasAnalyticsConsent(undefined)).toBe(false);
    expect(hasAnalyticsConsent("gsg_consent=2.a1.2026-01-01T00:00:00.000Z")).toBe(false);
  });

  it("extracts the GA client id", () => {
    expect(gaClientId("_ga=GA1.1.111.222")).toBe("111.222");
    expect(gaClientId("_ga=nope")).toBeUndefined();
  });
});
