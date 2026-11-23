import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/**
 * Marks a resolver or route as reachable without authentication. Everything else is denied by
 * DenyByDefaultGuard (OWASP A01). Until OAuth login is built, the demo notes API is public.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
