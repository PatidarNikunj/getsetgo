import { type ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { ACCESS_COOKIE } from "../auth/cookies";
import type { TokensService } from "../auth/tokens.service";
import { DenyByDefaultGuard } from "./deny-by-default.guard";
import { Public } from "./public.decorator";

class PrivateHandlers {
  secret(): void {}
}

@Public()
class PublicHandlers {
  open(): void {}
}

const tokens = {
  verifyAccessToken: (token: string) =>
    Promise.resolve(token === "good" ? { userId: "u1", sessionId: "s1" } : undefined),
} as unknown as TokensService;

const contextFor = (
  cls: new () => object,
  method: string,
  req: Record<string, unknown> = {},
): ExecutionContext =>
  ({
    getType: () => "http",
    getClass: () => cls,
    getHandler: () => (cls.prototype as Record<string, unknown>)[method],
    switchToHttp: () => ({ getRequest: () => req }),
  }) as unknown as ExecutionContext;

describe("DenyByDefaultGuard", () => {
  const guard = new DenyByDefaultGuard(new Reflector(), tokens);

  it("rejects private handlers without an access cookie", async () => {
    await expect(guard.canActivate(contextFor(PrivateHandlers, "secret"))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("rejects an invalid access cookie", async () => {
    const req = { cookies: { [ACCESS_COOKIE]: "forged" } };
    await expect(guard.canActivate(contextFor(PrivateHandlers, "secret", req))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("accepts a valid access cookie and attaches the user", async () => {
    const req: Record<string, unknown> = { cookies: { [ACCESS_COOKIE]: "good" } };
    await expect(guard.canActivate(contextFor(PrivateHandlers, "secret", req))).resolves.toBe(true);
    expect(req.user).toEqual({ userId: "u1", sessionId: "s1" });
  });

  it("allows handlers on a @Public() class", async () => {
    await expect(guard.canActivate(contextFor(PublicHandlers, "open"))).resolves.toBe(true);
  });
});
