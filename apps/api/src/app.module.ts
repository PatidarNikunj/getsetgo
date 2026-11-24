import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { ApolloDriver, type ApolloDriverConfig } from "@nestjs/apollo";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { GraphQLModule } from "@nestjs/graphql";
import { MongooseModule } from "@nestjs/mongoose";
import { SentryGlobalFilter, SentryModule } from "@sentry/nestjs/setup";
import { ThrottlerModule } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { LoggerModule } from "nestjs-pino";

import { AiModule } from "./ai/ai.module";
import { CacheModule } from "./cache/cache.module";
import { ConfigModule } from "./config/config.module";
import type { Env } from "./config/env";
import { formatGraphQLError } from "./graphql/format-error";
import { HealthController } from "./health/health.controller";
import { NotesModule } from "./notes/notes.module";
import { ObservabilityModule } from "./observability/observability.module";
import { PrismaModule } from "./prisma/prisma.module";
import { DenyByDefaultGuard } from "./security/deny-by-default.guard";
import { depthLimit } from "./security/depth-limit.rule";
import { GqlThrottlerGuard } from "./security/gql-throttler.guard";

const isProduction = process.env.NODE_ENV === "production";
// Only trust an incoming request ID that is safe to log (OWASP A09, log injection).
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

@Module({
  imports: [
    // First, so Sentry wraps everything that follows.
    SentryModule.forRoot(),
    ConfigModule,
    ObservabilityModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        genReqId: (req, res) => {
          const incoming = req.headers["x-request-id"];
          const id =
            typeof incoming === "string" && SAFE_REQUEST_ID.test(incoming)
              ? incoming
              : randomUUID();
          res.setHeader("X-Request-ID", id);
          return id;
        },
        // Never log credentials (OWASP A09).
        redact: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
        transport: isProduction
          ? undefined
          : { target: "pino-pretty", options: { singleLine: true } },
      },
    }),
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 120 }]),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        uri: config.get("MONGODB_URI", { infer: true }),
        serverSelectionTimeoutMS: 3000,
      }),
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      // Code-first: the schema is generated from the TypeScript classes. In development it's also
      // written to schema.graphql so the frontends can generate typed hooks from it.
      autoSchemaFile: isProduction ? true : join(process.cwd(), "schema.graphql"),
      sortSchema: true,
      path: "/graphql",
      // OWASP A05: no schema browsing or sandbox in production.
      introspection: !isProduction,
      graphiql: false,
      playground: false,
      csrfPrevention: true,
      includeStacktraceInErrorResponses: !isProduction,
      formatError: (formatted) => formatGraphQLError(formatted, { isProduction }),
      validationRules: [depthLimit(8)],
      context: ({ req, res }: { req: Request; res: Response }) => ({ req, res }),
    }),
    PrismaModule,
    CacheModule,
    AiModule,
    NotesModule,
  ],
  controllers: [HealthController],
  providers: [
    // Reports unexpected errors (5xx) to Sentry; expected ones (validation, not found) are skipped.
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
    // Order matters: rate-limit first, then deny anything not explicitly allowed.
    { provide: APP_GUARD, useClass: GqlThrottlerGuard },
    { provide: APP_GUARD, useClass: DenyByDefaultGuard },
  ],
})
export class AppModule {}
