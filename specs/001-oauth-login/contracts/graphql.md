# Contract: GraphQL changes

The schema is code-first in `apps/api`. Client operations live in `packages/graphql/src/operations/`
and their types are generated (`pnpm --filter @getsetgo/graphql codegen`).

## Authentication

- The global `DenyByDefaultGuard` resolves `req.user = { userId, sessionId }` from a valid
  `__Host-gsg_at` cookie (signature, `iss`, `aud`, `exp`).
- With no valid cookie, a non-`@Public()` operation fails with `extensions.code = "UNAUTHENTICATED"`
  (HTTP 200, standard GraphQL error). The web apps renew once on this code, then send the user to
  `/sign-in`.
- `@Public()` is **removed** from `NotesResolver`. No GraphQL operation is public after this feature.

## New types and operations

```graphql
enum AuthProvider {
  GOOGLE
  GITHUB
  TEST
}

"The signed-in user (only ever yourself)."
type Viewer {
  id: ID!
  displayName: String!
  "Only if the provider shared a verified email"
  email: String
  avatarUrl: String
  provider: AuthProvider!
  "Provider username (GitHub/test), shown when there is no email"
  login: String
  createdAt: DateTime!
}

type Query {
  "The signed-in user"
  me: Viewer!
}

type Mutation {
  "End every session of the signed-in user, including this one; clears this browser's cookies"
  signOutEverywhere: Boolean!
  "Permanently delete the signed-in user, their notes, summaries and sessions; clears cookies"
  deleteAccount: Boolean!
}
```

## Changed behavior (signatures unchanged)

| Operation           | Before         | After                                                                                 |
| ------------------- | -------------- | ------------------------------------------------------------------------------------- |
| `notesList(page)`   | all notes      | the caller's notes only (cache keyed per owner)                                       |
| `note(id)`          | any note       | caller's note, otherwise `NOT_FOUND` (same as nonexistent, FR-014)                    |
| `createNote(input)` | ownerless      | owned by the caller; `UNAUTHENTICATED` if the user was deleted                        |
| `deleteNote(id)`    | any note       | caller's note; another user's note → `false`/`NOT_FOUND`, exactly like a missing note |
| `summarizeNote(id)` | any note       | caller's note; the summary stores `ownerId`                                           |
| `Note.summary`      | latest summary | unchanged (reachable only through an owned note)                                      |

## Client operations (`packages/graphql/src/operations/auth.graphql`)

```graphql
query Me {
  me {
    id
    displayName
    email
    avatarUrl
    provider
    login
    createdAt
  }
}

mutation SignOutEverywhere {
  signOutEverywhere
}

mutation DeleteAccount {
  deleteAccount
}
```

## Shared accessible names (both web apps, used by `packages/e2e`)

| Element              | Accessible name                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------- |
| sign-in heading      | "Sign in"                                                                                 |
| provider buttons     | "Continue with Google", "Continue with GitHub", "Continue with test provider"             |
| sign-in error region | `role="alert"`                                                                            |
| header menu button   | "Account menu"                                                                            |
| menu items           | "Account", "Sign out", "Sign out everywhere"                                              |
| account heading      | "Account"                                                                                 |
| delete button        | "Delete account"                                                                          |
| delete dialog        | `role="alertdialog"`, name "Delete your account?"; buttons "Delete permanently", "Cancel" |
