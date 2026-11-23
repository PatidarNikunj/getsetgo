import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { IS_PUBLIC_KEY } from "./public.decorator";

/**
 * Global guard: a handler must be explicitly marked @Public() (or, once auth exists, have an
 * authenticated user) to run. Forgetting a decorator fails closed, not open (OWASP A01).
 */
@Injectable()
export class DenyByDefaultGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    // TODO(auth spec): allow requests carrying a valid access-token cookie.
    throw new UnauthorizedException();
  }
}
