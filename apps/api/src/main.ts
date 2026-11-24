// Must be first: Sentry instruments modules as they load.
import "./instrument";
import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module";
import type { Env } from "./config/env";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Security headers (OWASP A05). The API serves JSON only, so the CSP can be very strict.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      frameguard: { action: "deny" },
      crossOriginResourcePolicy: { policy: "same-site" },
    }),
  );
  app.disable("x-powered-by");
  // Behind proxies (Vercel rewrite → Render load balancer): trust exactly that many hops so rate
  // limiting sees the real client IP, without letting clients spoof X-Forwarded-For.
  app.set("trust proxy", config.get("TRUST_PROXY_HOPS", { infer: true }));
  app.useBodyParser("json", { limit: "100kb" });

  // CORS: only the configured frontends, with cookies (needed for the upcoming auth feature).
  app.enableCors({
    origin: config.get("CORS_ORIGINS", { infer: true }),
    credentials: true,
    maxAge: 600,
  });

  // Validate every input DTO; strip and reject unknown fields (OWASP A03).
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  app.enableShutdownHooks();
  await app.listen(config.get("PORT", { infer: true }));
}

void bootstrap();
