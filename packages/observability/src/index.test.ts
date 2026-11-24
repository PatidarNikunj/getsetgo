import { describe, expect, it } from "vitest";

import {
  analyticsCspSources,
  gaBootstrapScript,
  isValidMeasurementId,
  scrubSensitive,
  sentryOptions,
} from "./index";

describe("scrubSensitive", () => {
  it("redacts credentials and note content at any depth", () => {
    const event = {
      request: { headers: { authorization: "Bearer x", cookie: "a=b", "user-agent": "ok" } },
      extra: { variables: { input: { title: "Trip", content: "private text" } } },
      contexts: [{ apiKey: "k" }],
    };
    expect(scrubSensitive(event)).toEqual({
      request: {
        headers: { authorization: "[redacted]", cookie: "[redacted]", "user-agent": "ok" },
      },
      extra: { variables: { input: { title: "Trip", content: "[redacted]" } } },
      contexts: [{ apiKey: "[redacted]" }],
    });
  });
});

describe("sentryOptions", () => {
  it("is disabled without a DSN", () => {
    expect(sentryOptions({}).enabled).toBe(false);
  });

  it("clamps the sample rate and turns off data collection", () => {
    const options = sentryOptions({
      dsn: "https://k@o1.ingest.sentry.io/1",
      tracesSampleRate: "5",
    });
    expect(options.enabled).toBe(true);
    expect(options.tracesSampleRate).toBe(1);
    expect(options.dataCollection.cookies).toBe(false);
    expect(options.dataCollection.httpBodies).toEqual([]);
    expect(options.dataCollection.graphQL.variables).toBe(false);
  });
});

describe("Google Analytics helpers", () => {
  it("validates measurement ids", () => {
    expect(isValidMeasurementId("G-ABC123XYZ")).toBe(true);
    expect(isValidMeasurementId("UA-123")).toBe(false);
    expect(isValidMeasurementId("G-abc'); alert(1); ('")).toBe(false);
  });

  it("builds a bootstrap with ad features off", () => {
    const script = gaBootstrapScript("G-ABC123XYZ");
    expect(script).toContain("gtag('config', 'G-ABC123XYZ'");
    expect(script).toContain("ad_storage: 'denied'");
    expect(() => gaBootstrapScript("bad")).toThrow();
  });

  it("adds CSP origins only when GA is configured", () => {
    expect(analyticsCspSources(undefined)).toEqual({});
    expect(analyticsCspSources("G-ABC123XYZ")["script-src"]).toEqual([
      "https://www.googletagmanager.com",
    ]);
  });
});
