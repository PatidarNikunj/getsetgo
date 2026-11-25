import { createParamDecorator, type ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import type { Request } from "express";

/** Set on the request by DenyByDefaultGuard from a valid access cookie. */
export interface AuthUser {
  userId: string;
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express's documented way to extend Request.
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requestFromContext(context: ExecutionContext): Request {
  if (context.getType<string>() === "graphql") {
    return GqlExecutionContext.create(context).getContext<{ req: Request }>().req;
  }
  return context.switchToHttp().getRequest<Request>();
}

/** The signed-in user. Only use on handlers that aren't @Public(). */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const user = requestFromContext(context).user;
  if (!user) throw new UnauthorizedException();
  return user;
});
