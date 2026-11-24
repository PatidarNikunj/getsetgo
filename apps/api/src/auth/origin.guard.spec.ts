import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";

import type { Env } from "../config/env";
import { OriginGuard } from "./origin.guard";

const config = {
  get: () => ["http://localhost:3000", "http://localhost:3001"],
} as unknown as ConfigService<Env, true>;

const ctx = (method: string, origin?: string) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ method, headers: origin ? { origin } : {} }) }),
  }) as unknown as ExecutionContext;

describe("OriginGuard", () => {
  const guard = new OriginGuard(config);

  it("allows POSTs from the web apps", () => {
    expect(guard.canActivate(ctx("POST", "http://localhost:3001"))).toBe(true);
  });

  it("refuses POSTs from other or missing origins", () => {
    expect(() => guard.canActivate(ctx("POST", "https://evil.example"))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(ctx("POST"))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx("POST", "null"))).toThrow(ForbiddenException);
  });

  it("lets safe methods through", () => {
    expect(guard.canActivate(ctx("GET"))).toBe(true);
  });
});
