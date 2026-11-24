# Feature Specification: Sign-in with Google or GitHub (private notes)

**Feature Branch**: `001-oauth-login`

**Created**: 2026-11-24

**Status**: Draft

**Input**: User description: "Sign-in with OAuth (Google and GitHub) so notes become private to each user. Today the notes app is public; anyone who opens either web app sees and can delete everyone's notes. Visitors sign in with Google or GitHub from either web app (same behavior), then see and manage only their own notes; they stay signed in across visits for a reasonable time, a stolen session is short-lived and revocable (sign out everywhere); signed-out visitors see a sign-in page; invisible bot protection on sign-in; pre-existing ownerless notes are handled without leaks; AI summaries work for the owner only; constitution security and WCAG 2.2 AA apply; works through each web app's same-origin API proxy; users can see their signed-in account and delete their account and data."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Sign in and see only my notes (Priority: P1)

A visitor opens either web app, chooses "Continue with Google" or "Continue with GitHub", approves the
request at the provider, and lands back on their notes page. They see only the notes they created, and
can create, summarize and delete them exactly as before. Another person signing in sees only their own
notes.

**Why this priority**: This is the whole point of the feature: today every note is visible to and
deletable by anyone. Without this story nothing else matters.

**Independent Test**: Sign in as user A, create a note; sign in as user B in another browser; B never
sees A's note and cannot open, summarize or delete it, even by guessing its identifier.

**Acceptance Scenarios**:

1. **Given** a signed-out visitor, **When** they open either web app, **Then** they see a sign-in page
   with "Continue with Google" and "Continue with GitHub" and no notes.
2. **Given** a visitor on the sign-in page, **When** they complete sign-in with Google or GitHub for the
   first time, **Then** an account is created for them and they land on an empty notes page.
3. **Given** a returning user, **When** they sign in with the same provider account, **Then** they see
   the notes they created earlier.
4. **Given** two signed-in users A and B, **When** B requests, summarizes or deletes a note that belongs
   to A (for example by sending A's note identifier directly), **Then** the request is refused exactly as
   if the note did not exist, and nothing about A's note is revealed.
5. **Given** a signed-in user, **When** they summarize one of their notes, **Then** the AI summary is
   created and shown only to them.
6. **Given** a visitor who cancels or denies the request at the provider, **When** they return, **Then**
   they see the sign-in page again with a clear, non-technical message and can try again.

---

### User Story 2 - Stay signed in, sign out, sign out everywhere (Priority: P2)

A signed-in user comes back the next day (or next week) and is still signed in without doing anything.
From the header they can see which account they're using and sign out. If they think a device was lost
or a session was stolen, they can sign out of every device at once.

**Why this priority**: Makes daily use practical and gives users control over their sessions; it is
also how a stolen session gets cut off.

**Independent Test**: Sign in, close the browser, return within the stay-signed-in period and still be
signed in; sign out and confirm the notes page is no longer reachable; sign in on two browsers, use
"Sign out everywhere" in one, and confirm the other is signed out within the short session lifetime.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they look at the page header, **Then** they see their name or
   email, the provider they used (Google or GitHub), and a "Sign out" control.
2. **Given** a signed-in user who returns within 30 days of their last visit, **When** they open
   either web app, **Then** they are still signed in without re-entering anything.
3. **Given** a user who has not visited for more than 30 days, **When** they open the app, **Then**
   they are asked to sign in again.
4. **Given** a signed-in user, **When** they choose "Sign out", **Then** they are signed out on that
   browser, see the sign-in page, and the browser's back button does not show their notes.
5. **Given** a user signed in on several browsers, **When** they choose "Sign out everywhere", **Then**
   every other browser loses access within at most 15 minutes, and immediately on its next attempt to
   renew the session.
6. **Given** an attacker who copied a user's session from one browser, **When** the real user's session
   renews or the user signs out everywhere, **Then** the copied session stops working, and reuse of an
   already-used renewal credential signs out all of that user's sessions.

---

### User Story 3 - Account privacy: see and delete my account (Priority: P3)

A user can open an account page showing which provider account they're signed in with and when the
account was created, and can permanently delete their account. Deletion removes all of their notes and AI
summaries and signs them out everywhere.

**Why this priority**: Required for privacy (right to erasure) and trust, but the app is usable without
it for an initial release.

**Independent Test**: Create notes and summaries, delete the account, confirm the user is signed out
everywhere, the notes and summaries no longer exist, and signing in again with the same provider starts a
fresh, empty account.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they open the account page, **Then** they see their name, email
   (if the provider shared one), provider, and account creation date.
2. **Given** a signed-in user on the account page, **When** they choose "Delete account" and confirm in
   an accessible confirmation dialog, **Then** their account, notes, AI summaries and sessions are
   permanently removed and they see the sign-in page with a confirmation message.
3. **Given** a deleted account, **When** the same person signs in again with the same provider account,
   **Then** they get a new, empty account; nothing from the deleted account reappears.

---

### Edge Cases

- **Ownerless notes**: notes created before this feature have no owner. They must never be shown to any
  signed-in user, and are handled as decided in FR-019.
- **Same person, two providers**: a person who signs in with Google one day and GitHub the next (even
  with the same email address) gets two separate accounts. Accounts are never merged automatically by
  email, because an unverified email match could hand one person's notes to another.
- **Provider without an email**: some GitHub accounts don't share an email. Sign-in still works; the
  account page shows the provider username instead.
- **Bot protection rejects a real person**: if the invisible check scores a visitor as suspicious, they
  get a plain-language message and a way to try again; no puzzles or image challenges (WCAG 3.3.8).
- **Session expires mid-action**: if a user's short session expires while they're writing a note, it is
  renewed silently; if renewal is impossible, they're sent to sign-in and their unsaved draft is kept on
  the device (existing draft autosave).
- **Sign-in started in one web app, finished in the other**: each web app completes its own sign-in;
  sessions don't leak between the two apps.
- **Provider is down or slow**: the sign-in page shows that the provider is unavailable and suggests the
  other provider.
- **Tampered or replayed sign-in response**: responses that don't match the sign-in the visitor started
  are rejected.
- **Many failed or rapid sign-in attempts**: rate-limited per visitor without affecting other visitors.

## Requirements _(mandatory)_

### Functional Requirements

**Sign-in**

- **FR-001**: The system MUST let visitors sign in with a Google account or a GitHub account, from both
  web apps, with the same behavior and accessible names in both.
- **FR-002**: The system MUST create an account on a person's first successful sign-in with a given
  provider account, and recognize that provider account on later sign-ins.
- **FR-003**: The system MUST NOT merge accounts automatically based on matching email addresses
  (separate account per provider account).
- **FR-004**: The system MUST protect the sign-in flow against forged, tampered or replayed provider
  responses (the response must match a sign-in this browser started, and be used at most once).
- **FR-005**: The system MUST apply invisible bot protection to starting a sign-in, without puzzles,
  image challenges or other cognitive tests (WCAG 2.2 SC 3.3.8); suspicious attempts get a clear message
  and can retry.
- **FR-006**: The system MUST rate-limit sign-in attempts per visitor.
- **FR-007**: Signed-out visitors MUST see a sign-in page instead of notes, and MUST NOT be able to read,
  create, summarize or delete any note.

**Sessions**

- **FR-008**: A signed-in user MUST stay signed in for 30 days from their last activity without
  signing in again; after 30 days of inactivity they must sign in again.
- **FR-009**: The credential that proves who the user is on each request MUST be short-lived (15 minutes
  at most) and renewed automatically and invisibly while the user remains signed in.
- **FR-010**: Each renewal MUST replace the renewal credential with a new one; reusing an old renewal
  credential MUST end all of that user's sessions (stolen-session detection).
- **FR-011**: Session credentials MUST never be readable by page scripts, never appear in URLs, and never
  be sent to analytics, error reporting or logs.
- **FR-012**: The system MUST protect every state-changing request against cross-site request forgery.
- **FR-013**: Users MUST be able to sign out of the current browser, and to sign out of all browsers at
  once ("Sign out everywhere"), with the effect described in User Story 2.

**Access control**

- **FR-014**: Every note operation (list, read, create, summarize, delete) MUST require a signed-in user
  and MUST only act on that user's own notes; requests for another user's note MUST be refused as "not
  found" without revealing whether it exists.
- **FR-015**: AI summaries MUST be created and shown only for the owner of the note.
- **FR-016**: Access decisions MUST be made by the server on every request, never by the browser.

**Account and privacy**

- **FR-017**: Signed-in users MUST be able to see which account they're using (name or username, email
  if available, provider, account creation date).
- **FR-018**: Users MUST be able to permanently delete their account; this MUST delete their notes, AI
  summaries and sessions, and sign them out everywhere.
- **FR-019**: Notes created before this feature (no owner) MUST never be visible to any user and MUST be
  [NEEDS CLARIFICATION: what happens to existing ownerless notes? A: deleted when the feature ships; B: kept hidden until an administrator removes them; C: assigned to the first account that signs in].
- **FR-020**: Who may create an account MUST be [NEEDS CLARIFICATION: open sign-up or restricted? A: anyone with a Google or GitHub account; B: only an allowlist of emails/usernames set by the owner; C: anyone, but AI summaries only for allowlisted accounts].
- **FR-021**: The system MUST store only the account details needed for this feature (provider,
  provider account identifier, display name, email if provided, avatar link if provided, timestamps).

**Quality**

- **FR-022**: Sign-in, sign-out, account and deletion screens MUST meet WCAG 2.2 AA in light and dark
  mode, be fully keyboard operable, and announce errors and status changes to assistive technology.
- **FR-023**: Security-relevant events (sign-in success and failure, sign-out, sign out everywhere,
  stolen-session detection, account deletion) MUST be recorded for troubleshooting without recording
  credentials or note content.
- **FR-024**: Sign-in MUST work in both web apps through their existing same-origin connection to the
  server, with no cross-site requests from the browser.

### Key Entities

- **User**: a person's account in this app. Name or username, email (optional), avatar (optional),
  created date. Owns notes and sessions.
- **Linked provider account**: which provider (Google or GitHub) and the provider's stable identifier
  for the person. One per user in this feature (no merging).
- **Session**: one signed-in browser. Created at sign-in, renewed on use, expires after 30 days of
  inactivity, can be ended individually (sign out) or all at once (sign out everywhere). Tracks its
  current renewal credential so reuse of an old one can be detected.
- **Note** (existing): gains an owner (User). AI summaries belong to the note and therefore to its owner.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A first-time visitor can go from opening the app to seeing their (empty) notes page in
  under 30 seconds, excluding time spent at the provider.
- **SC-002**: In testing, 100% of attempts by one user to list, read, summarize or delete another user's
  notes are refused, across both web apps.
- **SC-003**: A user who returns within 30 days of their last visit is still signed in 100% of the time
  (no unexpected sign-outs).
- **SC-004**: After "Sign out everywhere", no other browser can access the user's notes for more than 15
  minutes, and none after its next session renewal.
- **SC-005**: Account deletion removes 100% of the user's notes and summaries, verified by attempting to
  access them afterwards.
- **SC-006**: Automated accessibility checks report zero WCAG 2.2 AA violations on the sign-in, account
  and deletion screens in light and dark mode, and every control is reachable by keyboard.
- **SC-007**: Zero session credentials or note contents appear in URLs, analytics events, error reports
  or logs during the test suite.

## Assumptions

- The two providers are Google and GitHub; others (Apple, Microsoft, email links, passwords) are out of
  scope for this feature.
- Each web app has its own sessions; signing in to web-material does not sign you in to web-shadcn.
- 30 days of inactivity and a 15-minute maximum for the short-lived credential are reasonable defaults
  for a personal notes app; they can be tuned later.
- Multi-factor authentication is delegated to the providers (Google/GitHub enforce their own).
- No admin interface is built in this feature; owner-only operations (if any) are done through
  configuration.
- Existing local draft autosave keeps unsaved text on the device; drafts are per browser, not per user.
- Automated tests can sign in without a real Google or GitHub account (a test-only provider stand-in
  that is impossible to enable in production).
- The constitution's security, accessibility, testing and observability principles apply in full.
