import type { ConfigService } from "@nestjs/config";

import type { Env } from "../config/env";
import { RecaptchaService } from "./recaptcha.service";

const configWith = (secret?: string) =>
  ({
    get: (key: string) =>
      ({
        RECAPTCHA_SECRET_KEY: secret,
        RECAPTCHA_MIN_SCORE: 0.5,
        CORS_ORIGINS: ["http://localhost:3000"],
      })[key],
  }) as unknown as ConfigService<Env, true>;

const answer = (body: object) => jest.fn().mockResolvedValue(Response.json(body));

describe("RecaptchaService", () => {
  it("is skipped without a secret", async () => {
    const service = new RecaptchaService(configWith(undefined));
    expect(service.enabled).toBe(false);
    await expect(service.verify(undefined)).resolves.toBe(true);
  });

  it("accepts a human score for our action and hostname", async () => {
    const service = new RecaptchaService(configWith("s"));
    service.fetchFn = answer({
      success: true,
      score: 0.9,
      action: "sign_in",
      hostname: "localhost",
    });
    await expect(service.verify("token")).resolves.toBe(true);
  });

  it.each([
    { success: true, score: 0.1, action: "sign_in", hostname: "localhost" },
    { success: true, score: 0.9, action: "other", hostname: "localhost" },
    { success: true, score: 0.9, action: "sign_in", hostname: "evil.example" },
    { success: false },
  ])("rejects %o", async (body) => {
    const service = new RecaptchaService(configWith("s"));
    service.fetchFn = answer(body);
    await expect(service.verify("token")).resolves.toBe(false);
  });

  it("fails closed on missing tokens and network errors", async () => {
    const service = new RecaptchaService(configWith("s"));
    await expect(service.verify(undefined)).resolves.toBe(false);
    service.fetchFn = jest.fn().mockRejectedValue(new Error("down"));
    await expect(service.verify("token")).resolves.toBe(false);
  });
});
