// Prisma 7 configuration: schema location, migrations, and the database URL (from apps/api/.env).
import { existsSync } from "node:fs";

import { defineConfig } from "prisma/config";

// Local development reads apps/api/.env (Node 24 built-in loader); production injects env vars.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Not required for `prisma generate` (e.g. in CI); migrate commands fail clearly without it.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
