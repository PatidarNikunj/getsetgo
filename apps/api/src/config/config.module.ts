import { Global, Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule, ConfigService } from "@nestjs/config";

import { type Env, validateEnv } from "./env";

/** Typed access to validated settings: `config.get("PORT", { infer: true })`. */
export type AppConfig = ConfigService<Env, true>;

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      // .env is only for local development; real environments inject variables directly.
      ignoreEnvFile: process.env.NODE_ENV === "production",
    }),
  ],
})
export class ConfigModule {}
