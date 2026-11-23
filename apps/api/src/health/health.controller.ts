import { Controller, Get, HttpCode, HttpStatus, Res } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";
import type { Connection } from "mongoose";

import { AiClientService } from "../ai/ai-client.service";
import { CacheService } from "../cache/cache.service";
import { PrismaService } from "../prisma/prisma.service";
import { Public } from "../security/public.decorator";

type Status = "up" | "down";

/** Liveness and readiness probes for Render and Docker. They never expose error details. */
@Public()
@SkipThrottle()
@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly ai: AiClientService,
    @InjectConnection() private readonly mongo: Connection,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  liveness(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("ready")
  async readiness(
    @Res({ passthrough: true }) res: Response,
  ): Promise<Record<string, Status | "ok" | "degraded">> {
    const [postgres, mongo, redis, ai] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.mongo.db
        ?.admin()
        .ping()
        .then(() => true)
        .catch(() => false) ?? Promise.resolve(false),
      this.cache.ping(),
      this.ai.ping(),
    ]);
    const s = (ok: boolean): Status => (ok ? "up" : "down");
    // The AI service is optional for readiness: notes still work without summaries.
    const ready = postgres && mongo && redis;
    if (!ready) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: ready ? "ok" : "degraded",
      postgres: s(postgres),
      mongo: s(mongo),
      redis: s(redis),
      ai: s(ai),
    };
  }
}
