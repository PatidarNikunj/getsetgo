import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/**
 * Marks a resolver or route as reachable without authentication. Everything else is denied by
 * DenyByDefaultGuard (OWASP A01). Use sparingly: sign-in routes and health checks.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
