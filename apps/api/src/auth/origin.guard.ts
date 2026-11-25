import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

import type { Env } from "../config/env";

/**
 * CSRF defense for the REST auth routes (FR-012): a POST must come from one of our web apps. The
 * browser sets Origin on every POST and scripts can't forge it; SameSite=Lax cookies are the
 * second layer. The web apps' server-side renewal sends its own origin.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed: Set<string>;

  constructor(config: ConfigService<Env, true>) {
    this.allowed = new Set(config.get("CORS_ORIGINS", { infer: true }));
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.method === "GET" || req.method === "HEAD") return true;
    const origin = req.headers.origin;
    if (typeof origin === "string" && this.allowed.has(origin)) return true;
    throw new ForbiddenException("Cross-site request refused");
  }
}

/** The web app that sent a request (validated Origin), or undefined. */
export function requestOrigin(req: Request, allowed: readonly string[]): string | undefined {
  const origin = req.headers.origin;
  return typeof origin === "string" && allowed.includes(origin) ? origin : undefined;
}
