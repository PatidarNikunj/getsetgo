import type { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import type { ThrottlerStorage } from "@nestjs/throttler";

import type { Env } from "../config/env";
import { CLIENT_IP_HEADER, CLIENT_IP_SIGNATURE_HEADER, signClientIpPayload } from "./client-ip";
import { GqlThrottlerGuard } from "./gql-throttler.guard";

const secret = "s".repeat(40);

/** Exposes the protected tracker so tests can check which bucket a request lands in. */
class TestGuard extends GqlThrottlerGuard {
  tracker(req: Record<string, unknown>): Promise<string> {
    return this.getTracker(req);
  }
}

const guardWith = (clientIpSecret: string | undefined) =>
  new TestGuard(
    [{ name: "default", ttl: 60_000, limit: 120 }],
    {} as ThrottlerStorage,
    new Reflector(),
    { get: () => clientIpSecret } as unknown as ConfigService<Env, true>,
  );

const signedHeaders = (ip: string, key = secret) => {
  const t = Math.floor(Date.now() / 1000);
  return {
    [CLIENT_IP_HEADER]: ip,
    [CLIENT_IP_SIGNATURE_HEADER]: `t=${t},v1=${signClientIpPayload(key, ip, t)}`,
  };
};

describe("GqlThrottlerGuard tracker", () => {
  const vercelIp = "76.76.21.21";

  it("uses the connection IP for ordinary requests", async () => {
    await expect(guardWith(secret).tracker({ ip: "203.0.113.7", headers: {} })).resolves.toBe(
      "203.0.113.7",
    );
  });

  it("gives each visitor of a server-rendered page their own bucket", async () => {
    const guard = guardWith(secret);
    const a = await guard.tracker({ ip: vercelIp, headers: signedHeaders("203.0.113.7") });
    const b = await guard.tracker({ ip: vercelIp, headers: signedHeaders("198.51.100.1") });
    expect(a).toBe("203.0.113.7");
    expect(b).toBe("198.51.100.1");
  });

  it("puts a visitor's server-side and browser calls in the same bucket", async () => {
    const guard = guardWith(secret);
    const viaRewrite = await guard.tracker({ ip: "::ffff:203.0.113.7", headers: {} });
    const viaServer = await guard.tracker({ ip: vercelIp, headers: signedHeaders("203.0.113.7") });
    expect(viaServer).toBe(viaRewrite);
  });

  it("ignores spoofed headers (wrong secret, or no secret configured)", async () => {
    const forged = signedHeaders("198.51.100.1", "x".repeat(40));
    await expect(guardWith(secret).tracker({ ip: "203.0.113.7", headers: forged })).resolves.toBe(
      "203.0.113.7",
    );
    await expect(
      guardWith(undefined).tracker({ ip: "203.0.113.7", headers: signedHeaders("198.51.100.1") }),
    ).resolves.toBe("203.0.113.7");
  });
});
