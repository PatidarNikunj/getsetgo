import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

import type { Env } from "../config/env";

/**
 * Small JSON cache on Redis. Cache failures are logged and treated as a miss, so Redis being
 * down slows the API down but never breaks it.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  readonly client: Redis;

  constructor(config: ConfigService<Env, true>) {
    this.client = new Redis(config.get("REDIS_URL", { infer: true }), {
      keyPrefix: "api:",
      maxRetriesPerRequest: 1,
      lazyConnect: false,
    });
    this.client.on("error", (err: Error) => this.logger.warn(`Redis error: ${err.message}`));
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await this.client.get(key);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    } catch (err) {
      this.logger.warn(`Cache read failed for ${key}: ${(err as Error).message}`);
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (err) {
      this.logger.warn(`Cache write failed for ${key}: ${(err as Error).message}`);
    }
  }

  /** Delete every key starting with `prefix` (SCAN, not KEYS, so Redis isn't blocked). */
  async invalidate(prefix: string): Promise<void> {
    try {
      const fullPrefix = `api:${prefix}`;
      let cursor = "0";
      do {
        const [next, keys] = await this.client.scan(
          cursor,
          "MATCH",
          `${fullPrefix}*`,
          "COUNT",
          100,
        );
        cursor = next;
        if (keys.length > 0) {
          // Keys come back with the prefix; strip it because the client re-adds it.
          await this.client.del(...keys.map((k) => k.slice("api:".length)));
        }
      } while (cursor !== "0");
    } catch (err) {
      this.logger.warn(`Cache invalidation failed for ${prefix}: ${(err as Error).message}`);
    }
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === "PONG";
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
