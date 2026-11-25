import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  CLIENT_IP_HEADER,
  CLIENT_IP_SIGNATURE_HEADER,
  clientIpHeaders,
  signClientIp,
  visitorIp,
} from "./client-ip";

const secret = "s".repeat(40);
const now = 1_800_000_000_500;

describe("visitorIp", () => {
  it("prefers x-real-ip, then the first x-forwarded-for entry", () => {
    expect(
      visitorIp(new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1" })),
    ).toBe("203.0.113.7");
    expect(visitorIp(new Headers({ "x-forwarded-for": " 198.51.100.1 , 10.0.0.1" }))).toBe(
      "198.51.100.1",
    );
    expect(visitorIp(new Headers())).toBeUndefined();
  });
});

describe("signClientIp", () => {
  it("signs v1, timestamp and IP with HMAC-SHA256 (base64url)", async () => {
    const t = Math.floor(now / 1000);
    const mac = createHmac("sha256", secret).update(`v1\n${t}\n2001:db8::1`).digest("base64url");
    await expect(signClientIp(secret, "2001:db8::1", now)).resolves.toBe(`t=${t},v1=${mac}`);
  });
});

describe("clientIpHeaders", () => {
  it("adds the IP and its signature when a secret is set", async () => {
    const headers = await clientIpHeaders(new Headers({ "x-real-ip": "203.0.113.7" }), secret, now);
    expect(headers[CLIENT_IP_HEADER]).toBe("203.0.113.7");
    expect(headers[CLIENT_IP_SIGNATURE_HEADER]).toMatch(/^t=\d+,v1=[A-Za-z0-9_-]{43}$/);
  });

  it("adds nothing without a secret, without an IP, or for a value that isn't an IP", async () => {
    const ip = new Headers({ "x-real-ip": "203.0.113.7" });
    await expect(clientIpHeaders(ip, undefined)).resolves.toEqual({});
    await expect(clientIpHeaders(ip, "")).resolves.toEqual({});
    await expect(clientIpHeaders(new Headers(), secret)).resolves.toEqual({});
    await expect(
      clientIpHeaders(new Headers({ "x-real-ip": "<script>" }), secret),
    ).resolves.toEqual({});
  });
});
