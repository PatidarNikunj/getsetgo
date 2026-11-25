import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { ACCESS_COOKIE, readCookie } from "../auth/cookies";
import { requestFromContext } from "../auth/current-user.decorator";
import { TokensService } from "../auth/tokens.service";
import { IS_PUBLIC_KEY } from "./public.decorator";

/**
 * Global guard: a handler runs only if it's marked @Public() or the request carries a valid
 * access cookie (15-minute JWT). Forgetting a decorator fails closed, not open (OWASP A01).
 * The JWT is checked in memory; no database read per request (research D4).
 */
@Injectable()
export class DenyByDefaultGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = requestFromContext(context);
    const token = readCookie(req, ACCESS_COOKIE);
    const claims = token ? await this.tokens.verifyAccessToken(token) : undefined;
    // 401 becomes the GraphQL code UNAUTHENTICATED; the web apps renew once and retry.
    if (!claims) throw new UnauthorizedException("Sign in required");
    req.user = claims;
    return true;
  }
}
