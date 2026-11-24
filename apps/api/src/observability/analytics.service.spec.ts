import type { ConfigService } from "@nestjs/config";
import type { Request } from "express";

import type { Env } from "../config/env";
import { AnalyticsService } from "./analytics.service";

const config = (values: Partial<Record<keyof Env, string>>) =>
  ({ get: (key: keyof Env) => values[key] }) as unknown as ConfigService<Env, true>;

const configured = config({
  GA_MEASUREMENT_ID: "G-TEST12345",
  GA_API_SECRET: "secret",
  GA_MP_ENDPOINT: "https://ga.test/mp/collect",
});

const request = (cookie?: string) => ({ headers: { cookie } }) as unknown as Request;
const CONSENTED = "gsg_consent=1.a1.2026-01-01T00:00:00.000Z; _ga=GA1.1.111.222";

describe("AnalyticsService (GA4 Measurement Protocol)", () => {
  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
  });
  afterEach(() => fetchMock.mockRestore());

  it("sends the event with the visitor's GA client id when they consented", () => {
    new AnalyticsService(configured).track(request(CONSENTED), "note_created", {
      content_length: 5,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      "https://ga.test/mp/collect?measurement_id=G-TEST12345&api_secret=secret",
    );
    expect(JSON.parse(String(init.body))).toEqual({
      client_id: "111.222",
      events: [{ name: "note_created", params: { content_length: 5 } }],
    });
  });

  it.each([
    ["no consent cookie", "_ga=GA1.1.111.222"],
    ["analytics rejected", "gsg_consent=1.a0.2026-01-01T00:00:00.000Z; _ga=GA1.1.111.222"],
    ["no GA client id yet", "gsg_consent=1.a1.2026-01-01T00:00:00.000Z"],
  ])("sends nothing when there is %s", (_label, cookie) => {
    new AnalyticsService(configured).track(request(cookie), "note_created");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is a no-op when GA isn't configured", () => {
    const service = new AnalyticsService(config({ GA_MP_ENDPOINT: "https://ga.test/mp/collect" }));
    expect(service.enabled).toBe(false);
    service.track(request(CONSENTED), "note_created");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
