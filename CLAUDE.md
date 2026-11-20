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
- `packages/*`: shared code; `packages/config` has the TS/ESLint/Prettier/Vitest presets

## Commands

```bash
pnpm install          # install everything
pnpm lint             # ESLint across the workspace (Turborepo)
pnpm typecheck        # tsc --noEmit across the workspace
pnpm test             # all tests
pnpm build            # build all apps/packages
pnpm format           # Prettier
pnpm --filter <name> <script>   # run in a single package
```

## Conventions

- TypeScript `strict`; no `any` without a justifying comment. Pinned to TypeScript 6.0 and ESLint 9
  until `typescript-eslint` and `eslint-plugin-jsx-a11y` support newer majors.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
- Never commit `.env` files or secrets; add new variables to the relevant `.env.example`.
- New dependencies that need install scripts must be added to `onlyBuiltDependencies` in
  `pnpm-workspace.yaml`.
