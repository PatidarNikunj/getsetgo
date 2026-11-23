# getsetgo

A fun side project where I add code and logic at random to learn new technologies and explore AI.

It's a **pnpm + Turborepo monorepo** built with **Spec-Driven Development** (GitHub Spec Kit) and
Claude Code agents. Some libraries overlap on purpose (MUI _and_ shadcn, Redux _and_ Zustand…) so
they can be compared side by side; each has a clearly defined home.

## Stack

| Area                | Tech                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------- |
| Monorepo            | pnpm workspaces, Turborepo, Node 24, Python 3.13 + uv                                        |
| `apps/web-material` | Next.js 16, React 19, MUI, Redux Toolkit, Apollo Client, Formik + Yup                        |
| `apps/web-shadcn`   | Next.js 16, React 19, shadcn/ui + Tailwind 4, Zustand, TanStack Query, React Hook Form + Zod |
| `apps/api`          | NestJS, Apollo GraphQL, Prisma (Postgres), Mongoose (Mongo), Redis, OAuth + JWT              |
| `apps/ai`           | FastAPI, Claude agents, SQLAlchemy + Alembic, Beanie (Mongo)                                 |
| Cross-cutting       | reCAPTCHA v3, IndexedDB, httpOnly cookies, Sentry, Google Analytics, Vercel Analytics        |
| Quality             | OWASP Top 10, WCAG 2.2 AA, Vitest, Jest, Pytest, Playwright + axe                            |
| Hosting             | Vercel (web), Render (APIs), Neon (Postgres), MongoDB Atlas, Upstash (Redis)                 |
| CI/CD               | GitHub Actions, CodeQL, Dependabot, Claude Code Action                                       |

## Repository layout

```
apps/        Deployable apps: api (NestJS GraphQL), ai (FastAPI + Claude); web apps in Phase 4
packages/    Shared code; config/ holds TypeScript, ESLint, Prettier and Vitest presets
infra/       Docker init scripts and config for local databases
docs/        Guides (local development, later cloud deployment)
scripts/     Repo helper scripts
specs/       Feature specs created with Spec Kit (one folder per feature)
.specify/    Spec Kit templates, scripts and the project constitution
.claude/     Claude Code skills (Spec Kit slash commands)
```

## Getting started

Prerequisites: Node 24 (`nvm use`), pnpm 10, Docker, Python 3.13 and [uv](https://docs.astral.sh/uv/).

```bash
pnpm install
```

```bash
pnpm infra:env && pnpm infra:up
```

That starts Postgres, MongoDB and Redis locally. See
[`docs/local-development.md`](docs/local-development.md) for admin GUIs, connection strings and
troubleshooting.

```bash
pnpm --filter @getsetgo/api db:deploy && pnpm --filter @getsetgo/ai db:migrate
```

```bash
pnpm dev
```

That runs the GraphQL API on http://localhost:4000/graphql and the internal AI service. See
[`docs/backends.md`](docs/backends.md) for example queries and how to turn on Claude.

```bash
pnpm lint
```

Other root scripts: `pnpm build`, `pnpm dev`, `pnpm typecheck`, `pnpm test`, `pnpm format`.

## How features get built (Spec-Driven Development)

The rules every feature must follow (security, accessibility, testing, stack boundaries) are in
[`.specify/memory/constitution.md`](.specify/memory/constitution.md). In Claude Code:

1. `/speckit-specify <what you want and why>` creates `specs/NNN-feature/spec.md`
2. `/speckit-clarify` (optional) asks questions to remove ambiguity
3. `/speckit-plan <tech notes>` writes the technical plan and checks it against the constitution
4. `/speckit-tasks` breaks the plan into ordered tasks
5. `/speckit-implement` has Claude build the tasks

## Roadmap

- [x] Phase 1: Monorepo foundation, shared configs, Spec Kit + constitution
- [x] Phase 2: Local infrastructure (Docker Compose: Postgres, Mongo, Redis)
- [x] Phase 3: Backends (NestJS GraphQL API, FastAPI AI service)
- [ ] Phase 4: Frontends (two Next.js apps)
- [ ] Phase 5: Observability & client storage (Sentry, GA, Vercel, IndexedDB, cookies)
- [ ] Phase 6: CI/CD & cloud deploy guide
