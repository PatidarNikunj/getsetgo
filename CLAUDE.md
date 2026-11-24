# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repository.

## What this is

A learning monorepo (pnpm workspaces + Turborepo). Read
[`.specify/memory/constitution.md`](.specify/memory/constitution.md) before any feature work. It
is the source of truth for stack boundaries, security (OWASP Top 10), accessibility
(WCAG 2.2 AA), and testing rules.

## Workflow

- **Features:** use the Spec Kit skills in order: `/speckit-specify` → `/speckit-clarify` (optional)
  → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`. Specs live in `specs/NNN-feature/`.
- **Small fixes** (bugs, dependency bumps, config) can skip the spec flow.
- When a choice has several reasonable options that the constitution doesn't settle, ask the user
  instead of picking one silently.

## Stack boundaries (don't mix)

- `apps/web-material`: MUI · Redux Toolkit · Apollo Client · Formik + Yup
- `apps/web-shadcn`: shadcn/ui + Tailwind · Zustand · TanStack Query · React Hook Form + Zod
- `apps/api`: NestJS + Apollo GraphQL, Prisma (Postgres), Mongoose (Mongo), Redis; owns auth
- `apps/ai`: FastAPI, internal only, called by `api`; Claude agents; Beanie (Mongo), SQLAlchemy (Postgres)
- Local databases: one database and login per service (see `docs/local-development.md`);
  never give a service access to another service's database.
- `packages/*`: shared code; `packages/config` has the TS/ESLint/Prettier/Vitest presets

## Commands

```bash
pnpm install          # install everything
pnpm lint             # ESLint across the workspace (Turborepo)
pnpm typecheck        # tsc --noEmit across the workspace
pnpm test             # all unit tests
pnpm test:e2e         # build web apps + Playwright/axe suite (needs the API running)
pnpm build            # build all apps/packages
pnpm format           # Prettier
pnpm infra:env        # create .env with random local passwords
pnpm infra:up         # start Postgres, Mongo, Redis (Docker); infra:tools adds GUIs
pnpm infra:reset      # delete local data and start fresh
pnpm stack:up         # run api + ai as production-like containers
pnpm --filter <name> <script>   # run in a single package
pnpm --filter @getsetgo/api test:e2e            # api e2e tests (needs infra:up)
pnpm --filter @getsetgo/api db:migrate          # new Prisma migration after editing schema.prisma
pnpm --filter @getsetgo/ai openapi && pnpm --filter @getsetgo/api ai:types   # refresh api↔ai contract
pnpm --filter @getsetgo/graphql codegen         # regenerate typed operations for the web apps
```

## Conventions

- Node 24 is required (NestJS 12 is ESM-only; Jest runs with `--experimental-vm-modules`).
- Python (`apps/ai`): uv for deps, Ruff + mypy strict; run tools with `uv run ...` inside `apps/ai`.
- Web apps: strict nonce CSP (Cache Components / PPR are off on purpose). Anything that injects
  `<script>` or `<style>` at runtime must receive the nonce; see `docs/frontends.md`.
- Observability (Sentry, GA) is off without keys. Never send note text, cookies or tokens to
  Sentry/GA: keep `dataCollection` locked down and GA consent-gated (see `docs/observability.md`).
- The API keeps small copies of `@getsetgo/consent` and the Sentry scrubber (it can't load
  TypeScript-source packages at runtime); `consent.spec.ts` checks they agree.
- Web apps share accessible names so `packages/e2e` can test both; keep them in sync.
- New GraphQL resolvers are denied unless marked `@Public()` (temporary) or authenticated.
- TypeScript `strict`; no `any` without a justifying comment. Pinned to TypeScript 6.0 and ESLint 9
  until `typescript-eslint` and `eslint-plugin-jsx-a11y` support newer majors.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
- Never commit `.env` files or secrets; add new variables to the relevant `.env.example`.
- New dependencies that need install scripts must be added to `onlyBuiltDependencies` in
  `pnpm-workspace.yaml`.
