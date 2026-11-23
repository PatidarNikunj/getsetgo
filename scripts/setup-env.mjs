#!/usr/bin/env node
// Creates .env from .env.example, replacing every "change-me" with a random password.
// Never overwrites an existing .env. Usage: pnpm infra:env
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const example = `${root}.env.example`;
const target = `${root}.env`;

if (existsSync(target)) {
  console.warn(".env already exists, leaving it untouched.");
  process.exit(0);
}

// URL-safe characters only, so passwords can go straight into connection strings.
const secret = () => randomBytes(24).toString("base64url");
const content = readFileSync(example, "utf8").replace(/=change-me$/gm, () => `=${secret()}`);

writeFileSync(target, content, { mode: 0o600 });
console.warn("Created .env with random local passwords.");
