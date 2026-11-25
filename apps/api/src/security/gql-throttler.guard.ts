import { type ExecutionContext, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { GqlExecutionContext } from "@nestjs/graphql";
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from "@nestjs/throttler";
import type { Request, Response } from "express";

import type { Env } from "../config/env";
import { verifiedClientIp } from "./client-ip";

/** Rate limiting that works for both REST routes and GraphQL resolvers (OWASP A04/A07). */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  private readonly clientIpSecret: string | undefined;

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    config: ConfigService<Env, true>,
  ) {
    super(options, storageService, reflector);
    this.clientIpSecret = config.get("CLIENT_IP_SECRET", { infer: true });
  }

  /**
   * The test sign-in provider (never available in production) is exempt, so e2e suites can sign
   * in once per test from one IP. Real providers keep their limits.
   */
  protected override shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (context.getType<string>() !== "http") return Promise.resolve(false);
    const req = context.switchToHttp().getRequest<Request>();
    return Promise.resolve(/^\/auth\/test\//.test(req.path ?? ""));
  }

  /**
   * Per visitor: the connection IP (from TRUST_PROXY_HOPS), or, for the web apps' server-side
   * calls, the visitor IP they signed with CLIENT_IP_SECRET. Both paths land in the same bucket.
   */
  // Record<string, any> is the base class's signature; we only read headers and ip from it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected override getTracker(req: Record<string, any>): Promise<string> {
    const { headers, ip } = req as Pick<Request, "headers" | "ip">;
    const signed = verifiedClientIp(headers ?? {}, this.clientIpSecret);
    return super.getTracker({ ip: signed ?? ip });
  }

  override getRequestResponse(context: ExecutionContext): { req: Request; res: Response } {
    if (context.getType<string>() === "graphql") {
      const ctx = GqlExecutionContext.create(context).getContext<{ req: Request; res: Response }>();
      return { req: ctx.req, res: ctx.res };
    }
    const http = context.switchToHttp();
    return { req: http.getRequest<Request>(), res: http.getResponse<Response>() };
  }
}
