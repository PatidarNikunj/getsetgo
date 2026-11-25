import "dotenv/config";

import type { INestApplication } from "@nestjs/common";
import { getModelToken } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import request from "supertest";

import { ACCESS_COOKIE, OAUTH_STATE_COOKIE, REFRESH_COOKIE } from "../src/auth/cookies";
import { REUSE_GRACE_MS } from "../src/auth/sessions.service";
import { NoteSummaryDoc } from "../src/notes/note-summary.schema";
import { PrismaService } from "../src/prisma/prisma.service";
import { createApp, gql, Jar, ORIGIN, signIn, uniqueLogin } from "./auth-helpers";

/**
 * Sign-in, sessions and account deletion (specs/001-oauth-login), through the test provider.
 * Requires `pnpm infra:up` and apps/api/.env with APP_ENV=development|test,
 * AUTH_TEST_PROVIDER=enabled and test:e2e-* in AUTH_ALLOWLIST (pnpm infra:env sets these).
 */
describe("Auth (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  /** POST /auth/refresh like a browser: applies the returned cookies to the jar. */
  const refresh = (jar: Jar) => {
    const req = request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Origin", ORIGIN)
      .set("Cookie", jar.header());
    return {
      expect: async (status: number) => {
        const res = await req.expect(status);
        jar.apply(res.headers["set-cookie"]);
        return res;
      },
    };
  };

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("US1: sign in", () => {
    it("lists the test provider for a known web origin only", async () => {
      const known = await request(app.getHttpServer())
        .get(`/auth/providers?origin=${encodeURIComponent(ORIGIN)}`)
        .expect(200);
      expect(known.body.providers).toContain("test");
      const unknown = await request(app.getHttpServer())
        .get("/auth/providers?origin=https%3A%2F%2Fevil.example")
        .expect(200);
      expect(unknown.body.providers).toEqual([]);
    });

    it("signs in, sets httpOnly session cookies and lands on /", async () => {
      const jar = new Jar();
      const login = uniqueLogin();
      const result = await signIn(app, jar, login);
      expect(result).toEqual({ status: 303, location: "/" });
      expect(jar.get(ACCESS_COOKIE)).toBeTruthy();
      expect(jar.get(REFRESH_COOKIE)).toBeTruthy();
      expect(jar.get(OAUTH_STATE_COOKIE)).toBeUndefined();

      const me = await gql(app, jar, "{ me { displayName provider login email } }").expect(200);
      expect(me.body.data.me).toEqual({ displayName: login, provider: "TEST", login, email: null });
    });

    it("sets cookie attributes the browser enforces", async () => {
      const server = app.getHttpServer();
      const start = await request(server)
        .post("/auth/test/start")
        .set("Origin", ORIGIN)
        .type("form");
      const cookie = (start.headers["set-cookie"] as unknown as string[])[0] ?? "";
      expect(cookie).toMatch(/^__Host-gsg_oauth=/);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/Secure/);
      expect(cookie).toMatch(/SameSite=Lax/);
      expect(cookie).toMatch(/Path=\//);
      expect(start.headers["cache-control"]).toBe("no-store");
    });

    it("recognizes a returning user", async () => {
      const login = uniqueLogin();
      const a = new Jar();
      await signIn(app, a, login);
      const first = await gql(app, a, "{ me { id } }");
      const b = new Jar();
      await signIn(app, b, login);
      const second = await gql(app, b, "{ me { id } }");
      expect(second.body.data.me.id).toBe(first.body.data.me.id);
    });

    it("keeps people who aren't on the allowlist out, without creating an account", async () => {
      const jar = new Jar();
      const result = await signIn(app, jar, "mallory-not-invited");
      expect(result).toEqual({ status: 303, location: "/sign-in?error=invite_only" });
      expect(jar.get(ACCESS_COOKIE)).toBeUndefined();
      const account = await prisma.providerAccount.findFirst({
        where: { provider: "TEST", providerAccountId: "mallory-not-invited" },
      });
      expect(account).toBeNull();
    });

    it("handles a cancelled sign-in", async () => {
      const result = await signIn(app, new Jar(), uniqueLogin(), { cancel: true });
      expect(result.location).toBe("/sign-in?error=denied");
    });

    it("honors safe returnTo paths and ignores open redirects", async () => {
      expect((await signIn(app, new Jar(), uniqueLogin(), { returnTo: "/account" })).location).toBe(
        "/account",
      );
      expect(
        (await signIn(app, new Jar(), uniqueLogin(), { returnTo: "//evil.example" })).location,
      ).toBe("/");
    });

    it("rejects a callback whose state doesn't match this browser, and replays", async () => {
      const server = app.getHttpServer();
      const jar = new Jar();
      const start = await request(server)
        .post("/auth/test/start")
        .set("Origin", ORIGIN)
        .type("form");
      jar.apply(start.headers["set-cookie"]);
      const authorize = new URL(start.headers.location as string);
      const consent = await request(server)
        .post("/auth/test/authorize")
        .set("Origin", ORIGIN)
        .type("form")
        .send({
          redirect_uri: authorize.searchParams.get("redirect_uri"),
          state: authorize.searchParams.get("state"),
          code_challenge: authorize.searchParams.get("code_challenge"),
          login: uniqueLogin(),
          action: "continue",
        });
      const callback = new URL(consent.headers.location as string);

      // Another browser (no state cookie, e.g. a login-CSRF attempt) can't use the callback.
      const foreign = await request(server).get(`/auth/test/callback${callback.search}`);
      expect(foreign.headers.location).toBe("/sign-in?error=expired");

      const ok = await request(server)
        .get(`/auth/test/callback${callback.search}`)
        .set("Cookie", jar.header());
      expect(ok.headers.location).toBe("/");

      // Replaying the same response (same state and code) fails.
      const replay = await request(server)
        .get(`/auth/test/callback${callback.search}`)
        .set("Cookie", jar.header());
      expect(replay.headers.location).toBe("/sign-in?error=expired");
    });

    it("rejects a code issued for another PKCE challenge", async () => {
      const server = app.getHttpServer();
      const jar = new Jar();
      const start = await request(server)
        .post("/auth/test/start")
        .set("Origin", ORIGIN)
        .type("form");
      jar.apply(start.headers["set-cookie"]);
      const authorize = new URL(start.headers.location as string);
      const consent = await request(server)
        .post("/auth/test/authorize")
        .set("Origin", ORIGIN)
        .type("form")
        .send({
          redirect_uri: authorize.searchParams.get("redirect_uri"),
          state: authorize.searchParams.get("state"),
          code_challenge: "attacker-chosen-challenge",
          login: uniqueLogin(),
          action: "continue",
        });
      const callback = new URL(consent.headers.location as string);
      const res = await request(server)
        .get(`/auth/test/callback${callback.search}`)
        .set("Cookie", jar.header());
      expect(res.headers.location).toBe("/sign-in?error=failed");
    });

    it("refuses cross-site POSTs (CSRF)", async () => {
      await request(app.getHttpServer())
        .post("/auth/test/start")
        .set("Origin", "https://evil.example")
        .expect(403);
      await request(app.getHttpServer()).post("/auth/refresh").expect(403);
    });

    it("refuses forged access cookies", async () => {
      const jar = new Jar();
      jar.set(ACCESS_COOKIE, "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.");
      const res = await gql(app, jar, "{ me { id } }");
      expect(res.body.errors[0].extensions.code).toBe("UNAUTHENTICATED");
    });
  });

  describe("US2: stay signed in, sign out, sign out everywhere", () => {
    it("renews: rotates both cookies and slides the 30-day expiry", async () => {
      const jar = new Jar();
      const login = uniqueLogin();
      await signIn(app, jar, login);
      const before = jar.get(REFRESH_COOKIE);
      const account = await prisma.providerAccount.findFirstOrThrow({
        where: { provider: "TEST", providerAccountId: login },
      });
      const session = await prisma.session.findFirstOrThrow({ where: { userId: account.userId } });
      await refresh(jar).expect(204);
      expect(jar.get(REFRESH_COOKIE)).not.toBe(before);
      const after = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
      expect(after.expiresAt.getTime()).toBeGreaterThanOrEqual(session.expiresAt.getTime());
      await gql(app, jar, "{ me { id } }").expect(200);
    });

    it("works without an access cookie as long as the refresh cookie is valid", async () => {
      const jar = new Jar();
      await signIn(app, jar, uniqueLogin());
      jar.delete(ACCESS_COOKIE);
      const denied = await gql(app, jar, "{ me { id } }");
      expect(denied.body.errors[0].extensions.code).toBe("UNAUTHENTICATED");
      await refresh(jar).expect(204);
      const me = await gql(app, jar, "{ me { id } }");
      expect(me.body.data.me.id).toBeTruthy();
    });

    it("detects a stolen refresh token: reuse after the grace window ends the session", async () => {
      const jar = new Jar();
      await signIn(app, jar, uniqueLogin());
      const stolen = new Jar();
      stolen.set(REFRESH_COOKIE, jar.get(REFRESH_COOKIE) ?? "");

      await refresh(jar).expect(204); // the real user renews
      // Pretend the renewal happened longer ago than the grace window.
      await prisma.refreshToken.updateMany({
        where: { usedAt: { not: null }, createdAt: { gt: new Date(Date.now() - 60_000) } },
        data: { usedAt: new Date(Date.now() - REUSE_GRACE_MS - 5_000) },
      });

      await refresh(stolen).expect(401); // the copy is used: reuse detected
      await refresh(jar).expect(401); // and the real session is over too (FR-010)
      expect(jar.get(REFRESH_COOKIE)).toBeUndefined();
    });

    it("allows two tabs to renew with the same token at the same moment", async () => {
      const jar = new Jar();
      await signIn(app, jar, uniqueLogin());
      const tabA = new Jar();
      const tabB = new Jar();
      tabA.set(REFRESH_COOKIE, jar.get(REFRESH_COOKIE) ?? "");
      tabB.set(REFRESH_COOKIE, jar.get(REFRESH_COOKIE) ?? "");
      await refresh(tabA).expect(204);
      await refresh(tabB).expect(204);
    });

    it("signs out this browser only", async () => {
      const login = uniqueLogin();
      const here = new Jar();
      const there = new Jar();
      await signIn(app, here, login);
      await signIn(app, there, login);

      const signedOutToken = here.get(REFRESH_COOKIE) ?? "";
      const res = await request(app.getHttpServer())
        .post("/auth/sign-out")
        .set("Origin", ORIGIN)
        .set("Accept", "text/html")
        .set("Cookie", here.header());
      expect(res.status).toBe(303);
      expect(res.headers.location).toBe("/sign-in?signedOut=1");
      here.apply(res.headers["set-cookie"]);
      expect(here.get(ACCESS_COOKIE)).toBeUndefined();

      const oldRefresh = new Jar();
      oldRefresh.set(REFRESH_COOKIE, signedOutToken);
      await refresh(oldRefresh).expect(401);
      await refresh(there).expect(204);
    });

    it("signs out everywhere", async () => {
      const login = uniqueLogin();
      const a = new Jar();
      const b = new Jar();
      await signIn(app, a, login);
      await signIn(app, b, login);

      const res = await gql(app, a, "mutation { signOutEverywhere }").expect(200);
      expect(res.body.data.signOutEverywhere).toBe(true);
      a.apply(res.headers["set-cookie"]);
      expect(a.get(ACCESS_COOKIE)).toBeUndefined();
      // B's 15-minute access cookie still works until it expires, but it can't renew (US2-5).
      await refresh(b).expect(401);
    });

    it("ends sessions of people removed from the allowlist at their next renewal", async () => {
      const jar = new Jar();
      const login = uniqueLogin();
      await signIn(app, jar, login);
      await prisma.providerAccount.updateMany({
        where: { provider: "TEST", providerAccountId: login },
        data: { login: "removed-from-allowlist" },
      });
      await refresh(jar).expect(401);
    });

    it("refuses expired sessions", async () => {
      const jar = new Jar();
      const login = uniqueLogin();
      await signIn(app, jar, login);
      const account = await prisma.providerAccount.findFirstOrThrow({
        where: { provider: "TEST", providerAccountId: login },
      });
      await prisma.session.updateMany({
        where: { userId: account.userId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await refresh(jar).expect(401);
    });
  });

  describe("US3: delete my account", () => {
    it("deletes notes, summaries and sessions; signing in again starts fresh", async () => {
      const login = uniqueLogin();
      const jar = new Jar();
      const other = new Jar();
      await signIn(app, jar, login);
      await signIn(app, other, login);
      const me = (await gql(app, jar, "{ me { id createdAt } }")).body.data.me;
      const created = await gql(
        app,
        jar,
        "mutation($i: CreateNoteInput!) { createNote(input: $i) { id } }",
        { i: { title: "secret plans", content: "to be erased" } },
      );
      const noteId = created.body.data.createNote.id as string;
      const summaries = app.get<Model<NoteSummaryDoc>>(getModelToken(NoteSummaryDoc.name));
      await summaries.create({
        noteId,
        ownerId: me.id,
        summary: "s",
        keyPoints: [],
        model: "m",
        runId: "r",
      });

      const res = await gql(app, jar, "mutation { deleteAccount }").expect(200);
      expect(res.body.data.deleteAccount).toBe(true);
      jar.apply(res.headers["set-cookie"]);
      expect(jar.get(REFRESH_COOKIE)).toBeUndefined();

      expect(await prisma.user.findUnique({ where: { id: me.id } })).toBeNull();
      expect(await prisma.note.findUnique({ where: { id: noteId } })).toBeNull();
      expect(await prisma.session.count({ where: { userId: me.id } })).toBe(0);
      expect(await summaries.countDocuments({ ownerId: me.id })).toBe(0);
      await refresh(other).expect(401);
      // The other browser's access cookie can't create notes for a deleted user.
      const orphan = await gql(
        app,
        other,
        'mutation { createNote(input: {title: "x", content: "y"}) { id } }',
      );
      expect(orphan.body.errors[0].extensions.code).toBe("UNAUTHENTICATED");

      const again = new Jar();
      await signIn(app, again, login);
      const fresh = (await gql(app, again, "{ me { id } notesList { id } }")).body.data;
      expect(fresh.me.id).not.toBe(me.id);
      expect(fresh.notesList).toEqual([]);
    });
  });
});
