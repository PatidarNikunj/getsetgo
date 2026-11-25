import { clientIpHeaders, signClientIp } from "@getsetgo/web-security/client-ip";

import {
  CLIENT_IP_HEADER,
  CLIENT_IP_SIGNATURE_HEADER,
  signClientIpPayload,
  verifiedClientIp,
} from "./client-ip";

const secret = "s".repeat(40);
const now = 1_800_000_000_000;
const t = now / 1000;

const signed = (ip: string, timestamp = t, key = secret) => ({
  [CLIENT_IP_HEADER]: ip,
  [CLIENT_IP_SIGNATURE_HEADER]: `t=${timestamp},v1=${signClientIpPayload(key, ip, timestamp)}`,
});

describe("verifiedClientIp", () => {
  it("accepts a valid, recent signature for IPv4 and IPv6", () => {
    expect(verifiedClientIp(signed("203.0.113.7"), secret, now)).toBe("203.0.113.7");
    expect(verifiedClientIp(signed("2001:db8::1"), secret, now)).toBe("2001:db8::1");
  });

  it("ignores the headers when no secret is configured", () => {
    expect(verifiedClientIp(signed("203.0.113.7"), undefined, now)).toBeUndefined();
  });

  it("rejects a signature made with another secret (a browser can't forge one)", () => {
    expect(verifiedClientIp(signed("203.0.113.7", t, "x".repeat(40)), secret, now)).toBeUndefined();
  });

  it("rejects a valid signature moved to another IP", () => {
    const headers = { ...signed("203.0.113.7"), [CLIENT_IP_HEADER]: "198.51.100.1" };
    expect(verifiedClientIp(headers, secret, now)).toBeUndefined();
  });

  it("rejects old or future timestamps (replay window of 60 seconds)", () => {
    expect(verifiedClientIp(signed("203.0.113.7", t - 61), secret, now)).toBeUndefined();
    expect(verifiedClientIp(signed("203.0.113.7", t + 61), secret, now)).toBeUndefined();
    expect(verifiedClientIp(signed("203.0.113.7", t - 59), secret, now)).toBe("203.0.113.7");
  });

  it("rejects malformed or missing values", () => {
    const good = signed("203.0.113.7");
    const cases: Record<string, string | string[] | undefined>[] = [
      {},
      { [CLIENT_IP_HEADER]: "203.0.113.7" },
      { ...good, [CLIENT_IP_SIGNATURE_HEADER]: "garbage" },
      { ...good, [CLIENT_IP_SIGNATURE_HEADER]: `t=${t},v1=short` },
      { ...good, [CLIENT_IP_HEADER]: ["203.0.113.7", "198.51.100.1"] },
      signed("not-an-ip"),
      signed("203.0.113.7\nextra"),
    ];
    for (const headers of cases) expect(verifiedClientIp(headers, secret, now)).toBeUndefined();
  });
});

describe("agrees with @getsetgo/web-security", () => {
  it("verifies what the web apps sign", async () => {
    const headers = await clientIpHeaders(
      new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
      secret,
      now,
    );
    expect(headers[CLIENT_IP_HEADER]).toBe("203.0.113.7");
    expect(verifiedClientIp(headers, secret, now)).toBe("203.0.113.7");
  });

  it("produces the same signature for the same input", async () => {
    expect(await signClientIp(secret, "2001:db8::1", now)).toBe(
      `t=${t},v1=${signClientIpPayload(secret, "2001:db8::1", t)}`,
    );
  });
});
