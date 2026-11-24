<!--
Sync Impact Report
- 1.0.1 (2026-11-24, PATCH): III clarified: web apps use a per-request nonce CSP, so Next.js
  Partial Prerendering / Cache Components stay off; Technology Stack: Node 24 LTS.
- Version change: template → 1.0.0
- Added principles: I. Spec-Driven, II. Learning-First Stack Boundaries, III. Security by Default (OWASP Top 10),
  IV. Accessible by Default (WCAG 2.2 AA), V. Typed Contracts, VI. Tested, VII. Observable, VIII. Simplicity in Ops
- Added sections: Technology Stack, Development Workflow & Quality Gates, Governance
- Templates: plan-template.md "Constitution Check" reads this file at runtime — no edits needed
- Deferred: none
-->

# getsetgo Constitution

getsetgo is a learning monorepo. Its purpose is to try modern technologies and AI-assisted
development in a realistic, production-shaped codebase. "Learning" never excuses insecure,
inaccessible, or untested code: the principles below apply to every feature.

## Core Principles

### I. Spec-Driven Development (NON-NEGOTIABLE)

Every non-trivial feature MUST follow the Spec Kit flow before code is written:
`/speckit-specify` → (`/speckit-clarify`) → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`.

- Specs live in `specs/<NNN-feature>/` and describe *what* and *why*, not *how*.
- Plans MUST pass the Constitution Check below; any violation MUST be justified in the plan's
  Complexity Tracking table.
- Bug fixes, dependency bumps, and config tweaks MAY skip the flow.
- Claude agents implement from `tasks.md`; humans approve the spec and plan.

### II. Learning-First Stack Boundaries

Overlapping libraries are intentional, so each one has a clear home. Code MUST NOT mix them
across these boundaries:

| App | UI | State | Data fetching | Forms & validation |
|-----|----|-------|---------------|--------------------|
| `apps/web-material` | MUI | Redux Toolkit | Apollo Client | Formik + Yup |
| `apps/web-shadcn` | shadcn/ui + Tailwind | Zustand | TanStack Query (React Query) | React Hook Form + Zod |

| Service | Owns | Data |
|---------|------|------|
| `apps/api` (NestJS) | Public GraphQL API, auth (OAuth + JWT), core domain | PostgreSQL (Prisma), MongoDB (Mongoose), Redis (cache) |
| `apps/ai` (FastAPI) | Claude agents and AI features — internal only, called by `api` | MongoDB (Beanie), PostgreSQL (SQLAlchemy) |

Shared code belongs in `packages/*` and MUST be framework-agnostic unless the package name says otherwise.

### III. Security by Default — OWASP Top 10

- **Access control (A01):** deny by default; every GraphQL resolver and FastAPI route declares its
  auth requirement; `ai` accepts only service-to-service calls carrying a valid JWT.
- **Cryptography (A02):** TLS everywhere outside localhost; never roll your own crypto.
- **Injection (A03):** ORMs and parameterized queries only; validate all input at the boundary
  (Zod / Yup / class-validator / Pydantic); no `dangerouslySetInnerHTML` with untrusted data.
- **Design (A04):** threats are listed in each plan for auth, payments, file upload, and AI prompts
  (including prompt injection).
- **Misconfiguration (A05):** strict per-request nonce CSP in the web apps (no `'unsafe-inline'`
  scripts; Partial Prerendering stays off because it can't carry a nonce), HSTS, `X-Content-Type-Options`, `Referrer-Policy`,
  `frame-ancestors 'none'`; GraphQL introspection and playground disabled in production; restrictive CORS.
- **Components (A06):** Dependabot + `pnpm audit` / `pip-audit` in CI; no unmaintained packages.
- **Auth (A07):** OAuth via Google/GitHub; short-lived access JWT (≤15 min) + rotating refresh token,
  both in `httpOnly; Secure; SameSite=Lax` cookies; reCAPTCHA v3 on login and public forms; rate limiting.
- **Integrity (A08):** lockfiles committed; CI uses `--frozen-lockfile`; signed commits encouraged.
- **Logging (A09):** auth and authorization failures logged; secrets and PII never logged or sent to Sentry/GA.
- **SSRF (A10):** outbound URLs from user input are allow-listed.
- Secrets come from environment variables only; `.env*` files (except `.env.example`) are never committed.

### IV. Accessible by Default — WCAG 2.2 AA

- Semantic HTML first; ARIA only when native elements cannot express the role.
- All interactive elements keyboard-operable with a visible focus indicator that is not obscured (2.4.11).
- Target size ≥ 24×24 CSS px (2.5.8); text contrast ≥ 4.5:1; no information by color alone.
- Forms: visible labels, errors announced and linked via `aria-describedby`, no redundant re-entry (3.3.7),
  authentication without cognitive tests (3.3.8). reCAPTCHA v3 is invisible and therefore compliant.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- `eslint-plugin-jsx-a11y` errors and Playwright + axe violations fail CI.

### V. Typed Contracts

- TypeScript `strict` everywhere; no `any` without a comment explaining why.
- The GraphQL schema is the contract between frontends and `api`; client types are generated, never hand-written.
- `api` ↔ `ai` communicate through a typed OpenAPI contract generated by FastAPI.
- Python uses type hints and Pydantic models at every boundary.

### VI. Tested

- Each user story in a spec has at least one automated test that proves its acceptance criteria.
- Tools: Vitest + Testing Library (frontends, packages), Jest (NestJS), Pytest (FastAPI),
  Playwright + axe (end-to-end and accessibility).
- Tests run in CI on every pull request and MUST pass before merge.

### VII. Observable

- Errors and performance go to Sentry in every app and service, with environment and release tags.
- Product analytics via Google Analytics (consent-gated) and Vercel Analytics / Speed Insights on frontends.
- Structured JSON logs on the backends; a request ID propagates from frontend → `api` → `ai`.

### VIII. Simplicity in Ops

- Local: one `docker compose up` brings up the databases and services.
- Production: managed PaaS only (Vercel, Render, Neon, MongoDB Atlas, Upstash), free tiers first.
- Add infrastructure only when a spec needs it, and record the reason in that spec's plan.

## Technology Stack

- **Monorepo:** pnpm workspaces + Turborepo; Node 24 LTS; Python 3.13 with uv.
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, MUI, shadcn/ui,
  GraphQL, IndexedDB (via `idb`), httpOnly cookie sessions.
- **Backend:** NestJS + Apollo Server (GraphQL), FastAPI; Prisma, Mongoose, SQLAlchemy + Alembic, Beanie.
- **Data:** PostgreSQL, MongoDB, Redis.
- **AI:** Claude via the Anthropic SDK in `apps/ai`; Spec Kit + Claude Code for development.
- **CI/CD:** GitHub Actions (CI, CodeQL, Dependabot, Claude Code Action); Vercel and Render deploys.

Changing a stack choice requires a constitution amendment.

## Development Workflow & Quality Gates

1. Branch from `main`; one feature (one `specs/<NNN-feature>/`) per branch.
2. Every pull request MUST pass: lint, type-check, unit tests, build, accessibility checks, and security scans.
3. Commits follow Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:` …).
4. Pull requests link to their spec and note any constitution deviations.

## Governance

This constitution supersedes other practices in the repository. Amendments are made with
`/speckit-constitution`, recorded in the Sync Impact Report at the top of this file, and versioned
semantically: MAJOR for removed or redefined principles, MINOR for new principles or sections,
PATCH for clarifications. Runtime guidance for agents lives in `CLAUDE.md`.

**Version**: 1.0.1 | **Ratified**: 2026-11-20 | **Last Amended**: 2026-11-24
