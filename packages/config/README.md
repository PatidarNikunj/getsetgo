# @getsetgo/config

Shared presets so every app and package in the monorepo behaves the same way.

| Preset                    | Import                                     | Used by                            |
| ------------------------- | ------------------------------------------ | ---------------------------------- |
| TypeScript base           | `@getsetgo/config/tsconfig/base.json`      | everything                         |
| TypeScript library        | `@getsetgo/config/tsconfig/library.json`   | `packages/*`                       |
| TypeScript Next.js        | `@getsetgo/config/tsconfig/nextjs.json`    | `apps/web-*`                       |
| TypeScript Node           | `@getsetgo/config/tsconfig/node.json`      | `apps/api` (NestJS)                |
| ESLint base / next / node | `@getsetgo/config/eslint/{base,next,node}` | `eslint.config.js` in each package |
| Prettier                  | `@getsetgo/config/prettier`                | repo root                          |
| Vitest node / react       | `@getsetgo/config/vitest/{node,react}`     | `vitest.config.ts` in each package |

The ESLint `next` preset turns on `jsx-a11y` **strict** rules (WCAG 2.2) and bans
`dangerouslySetInnerHTML` (OWASP A03); both are enforced by the project constitution.

Versions are pinned to **TypeScript 6.0** and **ESLint 9**: `typescript-eslint` doesn't support
TypeScript 7 yet, and `eslint-plugin-jsx-a11y` doesn't support ESLint 10 yet. Revisit when they do.
