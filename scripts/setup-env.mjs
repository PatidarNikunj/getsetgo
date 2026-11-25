#!/usr/bin/env node
// Creates local .env files with random passwords. Usage: pnpm infra:env
//
// 1. Root .env (used by docker-compose.yml): created from .env.example, with every "change-me"
//    replaced by a random value. If it already exists, only keys it is missing are added.
// 2. apps/*/.env: created from each app's .env.example, with connection strings built from the
//    root .env so every app uses the right database, login and password. Existing app .env files
//    keep their values; only keys they are missing are appended.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const path = (p) => `${root}${p}`;

// URL-safe characters only, so passwords can go straight into connection strings.
const secret = () => randomBytes(24).toString("base64url");

/** Parse KEY=VALUE lines (ignores comments and blank lines). */
function parse(text) {
  const env = {};
  for (const line of text.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) env[match[1]] = match[2];
  }
  return env;
}

/** Replace the values of the given keys in an env file's text, keeping comments and order. */
function fill(text, values) {
  return text.replace(/^([A-Z0-9_]+)=.*$/gm, (line, key) =>
    key in values ? `${key}=${values[key]}` : line,
  );
}

function write(file, content) {
  writeFileSync(path(file), content, { mode: 0o600 });
}

// ---------- 1. Root .env ----------
const exampleText = readFileSync(path(".env.example"), "utf8");
if (!existsSync(path(".env"))) {
  write(
    ".env",
    exampleText.replace(/=change-me$/gm, () => `=${secret()}`),
  );
  console.warn("Created .env with random local passwords.");
} else {
  const current = parse(readFileSync(path(".env"), "utf8"));
  const missing = Object.entries(parse(exampleText)).filter(([key]) => !(key in current));
  if (missing.length > 0) {
    const lines = missing.map(
      ([key, value]) => `${key}=${value === "change-me" ? secret() : value}`,
    );
    writeFileSync(path(".env"), `\n# Added by pnpm infra:env\n${lines.join("\n")}\n`, {
      flag: "a",
    });
    console.warn(`Added to .env: ${missing.map(([key]) => key).join(", ")}`);
  }
}
const env = parse(readFileSync(path(".env"), "utf8"));

// ---------- 2. App .env files ----------
const host = "localhost";
const pg = (user, pass, db) => `${user}:${pass}@${host}:${env.POSTGRES_PORT}/${db}`;
const mongo = (user, pass, db) =>
  `mongodb://${user}:${pass}@${host}:${env.MONGO_PORT}/${db}?authSource=${db}`;

const apps = {
  "apps/api": {
    DATABASE_URL: `postgresql://${pg(env.API_DB_USER, env.API_DB_PASSWORD, env.API_DB_NAME)}`,
    MONGODB_URI: mongo(env.API_MONGO_USER, env.API_MONGO_PASSWORD, env.API_MONGO_DB),
    REDIS_URL: `redis://:${env.REDIS_PASSWORD}@${host}:${env.REDIS_PORT}/0`,
    SERVICE_JWT_SECRET: env.SERVICE_JWT_SECRET,
    AUTH_JWT_SECRET: env.AUTH_JWT_SECRET,
  },
  "apps/web-material": { API_URL: "http://localhost:4000" },
  "apps/web-shadcn": { API_URL: "http://localhost:4000" },
  "apps/ai": {
    DATABASE_URL: `postgresql+asyncpg://${pg(env.AI_DB_USER, env.AI_DB_PASSWORD, env.AI_DB_NAME)}`,
    MONGODB_URI: mongo(env.AI_MONGO_USER, env.AI_MONGO_PASSWORD, env.AI_MONGO_DB),
    MONGODB_DB: env.AI_MONGO_DB,
    SERVICE_JWT_SECRET: env.SERVICE_JWT_SECRET,
  },
};

for (const [app, values] of Object.entries(apps)) {
  const target = `${app}/.env`;
  if (!existsSync(path(`${app}/.env.example`))) continue;
  if (existsSync(path(target))) {
    const current = parse(readFileSync(path(target), "utf8"));
    const example = parse(readFileSync(path(`${app}/.env.example`), "utf8"));
    const missing = Object.keys(example).filter((key) => !(key in current));
    if (missing.length > 0) {
      const lines = missing.map((key) => `${key}=${values[key] ?? example[key]}`);
      writeFileSync(path(target), `\n# Added by pnpm infra:env\n${lines.join("\n")}\n`, {
        flag: "a",
      });
      console.warn(`Added to ${target}: ${missing.join(", ")}`);
    }
    continue;
  }
  write(target, fill(readFileSync(path(`${app}/.env.example`), "utf8"), values));
  console.warn(`Created ${target}.`);
}
