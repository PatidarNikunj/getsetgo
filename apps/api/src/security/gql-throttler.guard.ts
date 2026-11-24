import { type ExecutionContext, Injectable } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { Request, Response } from "express";

/** Rate limiting that works for both REST routes and GraphQL resolvers (OWASP A04/A07). */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  /**
   * The test sign-in provider (never available in production) is exempt, so e2e suites can sign
   * in once per test from one IP. Real providers keep their limits.
   */
  protected override shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (context.getType<string>() !== "http") return Promise.resolve(false);
    const req = context.switchToHttp().getRequest<Request>();
    return Promise.resolve(/^\/auth\/test\//.test(req.path ?? ""));
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
