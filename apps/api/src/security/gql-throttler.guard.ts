import { type ExecutionContext, Injectable } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { Request, Response } from "express";

/** Rate limiting that works for both REST routes and GraphQL resolvers (OWASP A04/A07). */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  override getRequestResponse(context: ExecutionContext): { req: Request; res: Response } {
    if (context.getType<string>() === "graphql") {
      const ctx = GqlExecutionContext.create(context).getContext<{ req: Request; res: Response }>();
      return { req: ctx.req, res: ctx.res };
    }
    const http = context.switchToHttp();
    return { req: http.getRequest<Request>(), res: http.getResponse<Response>() };
  }
}
