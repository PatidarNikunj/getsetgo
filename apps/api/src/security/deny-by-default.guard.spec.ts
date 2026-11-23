import { type ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { DenyByDefaultGuard } from "./deny-by-default.guard";
import { Public } from "./public.decorator";

class PrivateHandlers {
  secret(): void {}
}

@Public()
class PublicHandlers {
  open(): void {}
}

const contextFor = (cls: new () => object, method: string): ExecutionContext =>
  ({
    getClass: () => cls,
    getHandler: () => (cls.prototype as Record<string, unknown>)[method],
  }) as unknown as ExecutionContext;

describe("DenyByDefaultGuard", () => {
  const guard = new DenyByDefaultGuard(new Reflector());

  it("rejects handlers that are not marked @Public()", () => {
    expect(() => guard.canActivate(contextFor(PrivateHandlers, "secret"))).toThrow(
      UnauthorizedException,
    );
  });

  it("allows handlers on a @Public() class", () => {
    expect(guard.canActivate(contextFor(PublicHandlers, "open"))).toBe(true);
  });
});
