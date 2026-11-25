import "dotenv/config";

import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { createApp, gql, Jar, signIn, uniqueLogin } from "./auth-helpers";

/**
 * Requires `pnpm infra:up` and apps/api/.env (created by `pnpm infra:env`).
 * The AI service is optional: summarizeNote is only checked for a clean error when it's down.
 */
describe("Notes GraphQL API (e2e)", () => {
  let app: INestApplication;
  let alice: Jar;
  let bob: Jar;

  beforeAll(async () => {
    app = await createApp();
    alice = new Jar();
    bob = new Jar();
    await signIn(app, alice, uniqueLogin());
    await signIn(app, bob, uniqueLogin());
  });

  afterAll(async () => {
    await app.close();
  });

  it("reports readiness of Postgres, Mongo and Redis", async () => {
    const res = await request(app.getHttpServer()).get("/health/ready").expect(200);
    expect(res.body).toMatchObject({ status: "ok", postgres: "up", mongo: "up", redis: "up" });
  });

  it("refuses every note operation when signed out (FR-007)", async () => {
    const id = "00000000-0000-4000-8000-000000000000";
    for (const query of [
      "{ notesList { id } }",
      `{ note(id: "${id}") { id } }`,
      'mutation { createNote(input: { title: "t", content: "c" }) { id } }',
      `mutation { deleteNote(id: "${id}") }`,
      `mutation { summarizeNote(id: "${id}") { id } }`,
    ]) {
      const res = await gql(app, undefined, query);
      expect(res.body.errors[0].extensions.code).toBe("UNAUTHENTICATED");
      expect(res.body.data).toBeNull();
    }
  });

  it("creates, lists, fetches and deletes the owner's note", async () => {
    const created = await gql(
      app,
      alice,
      "mutation($i: CreateNoteInput!) { createNote(input: $i) { id title content summary { summary } } }",
      { i: { title: "  e2e note  ", content: "Written by the e2e test." } },
    ).expect(200);
    const note = created.body.data.createNote;
    expect(note).toMatchObject({ title: "e2e note", summary: null });

    const listed = await gql(app, alice, "{ notesList { id } }").expect(200);
    expect(listed.body.data.notesList.map((n: { id: string }) => n.id)).toContain(note.id);

    const fetched = await gql(app, alice, "query($id: ID!) { note(id: $id) { title } }", {
      id: note.id,
    });
    expect(fetched.body.data.note.title).toBe("e2e note");

    const deleted = await gql(app, alice, "mutation($id: ID!) { deleteNote(id: $id) }", {
      id: note.id,
    });
    expect(deleted.body.data.deleteNote).toBe(true);

    const listedAgain = await gql(app, alice, "{ notesList { id } }");
    expect(listedAgain.body.data.notesList.map((n: { id: string }) => n.id)).not.toContain(note.id);
  });

  it("keeps notes private: another user's note behaves exactly like a missing one (SC-002)", async () => {
    const created = await gql(
      app,
      alice,
      "mutation($i: CreateNoteInput!) { createNote(input: $i) { id } }",
      { i: { title: "alice only", content: "private" } },
    );
    const aliceNoteId = created.body.data.createNote.id as string;
    const missingId = "00000000-0000-4000-8000-000000000000";

    const bobList = await gql(app, bob, "{ notesList { id } }");
    expect(bobList.body.data.notesList.map((n: { id: string }) => n.id)).not.toContain(aliceNoteId);

    for (const query of [
      "query($id: ID!) { note(id: $id) { id title } }",
      "mutation($id: ID!) { deleteNote(id: $id) }",
      "mutation($id: ID!) { summarizeNote(id: $id) { id summary { summary } } }",
    ]) {
      const theirs = await gql(app, bob, query, { id: aliceNoteId });
      const missing = await gql(app, bob, query, { id: missingId });
      expect(theirs.body.errors[0].extensions.code).toBe("NOT_FOUND");
      expect(theirs.body.errors[0].message).toBe(missing.body.errors[0].message);
      expect(JSON.stringify(theirs.body)).not.toContain("alice only");
    }

    // Still there for Alice.
    const stillThere = await gql(app, alice, "query($id: ID!) { note(id: $id) { title } }", {
      id: aliceNoteId,
    });
    expect(stillThere.body.data.note.title).toBe("alice only");
  });

  it("rejects invalid input with BAD_USER_INPUT", async () => {
    const res = await gql(
      app,
      alice,
      'mutation { createNote(input: { title: "   ", content: "x" }) { id } }',
    );
    expect(res.body.errors[0].extensions.code).toBe("BAD_USER_INPUT");

    const badId = await gql(app, alice, '{ note(id: "not-a-uuid") { id } }');
    expect(badId.body.errors[0].extensions.code).toBe("BAD_USER_INPUT");
  });

  it("blocks CSRF-style simple requests", async () => {
    await request(app.getHttpServer())
      .post("/graphql")
      .set("content-type", "text/plain")
      .set("Cookie", alice.header())
      .send('{"query":"{ notesList { id } }"}')
      .expect(400);
  });
});
