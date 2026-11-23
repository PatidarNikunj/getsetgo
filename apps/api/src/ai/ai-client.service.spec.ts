import type { ConfigService } from "@nestjs/config";
import { jwtVerify } from "jose";

import type { Env } from "../config/env";
import { AiClientService, AiServiceError } from "./ai-client.service";

const SECRET = "s".repeat(40);
const config = {
  get: (key: keyof Env) =>
    ({ AI_SERVICE_URL: "http://ai.test/", SERVICE_JWT_SECRET: SECRET })[key as string],
} as unknown as ConfigService<Env, true>;

const body = { note_id: "n1", title: "T", content: "C" };
const okResponse = {
  run_id: "r1",
  summary: "S",
  key_points: ["k"],
  model: "claude-opus-5-5",
  input_tokens: 1,
  output_tokens: 1,
};

describe("AiClientService", () => {
  const client = new AiClientService(config);
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, "fetch");
  });
  afterEach(() => fetchMock.mockRestore());

  it("sends a short-lived service JWT and the request ID", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(okResponse), { status: 200 }));

    await expect(client.summarize(body, "req-1")).resolves.toEqual(okResponse);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://ai.test/v1/summaries");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-request-id"]).toBe("req-1");

    const token = headers.authorization!.replace("Bearer ", "");
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET), {
      issuer: "getsetgo-api",
      audience: "getsetgo-ai",
    });
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(60);
  });

  it.each([
    [422, "refused"],
    [503, "unavailable"],
    [500, "failed"],
    [401, "failed"],
  ])("maps HTTP %i to an AiServiceError of kind %s", async (status, kind) => {
    fetchMock.mockResolvedValue(new Response("{}", { status }));
    await expect(client.summarize(body)).rejects.toMatchObject({ kind });
  });

  it("treats network failures as unavailable", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(client.summarize(body)).rejects.toBeInstanceOf(AiServiceError);
  });
});
