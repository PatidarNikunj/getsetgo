import "dotenv/config";

import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";

/**
 * Requires `pnpm infra:up` and apps/api/.env (created by `pnpm infra:env`).
 * The AI service is optional: summarizeNote is only checked for a clean error when it's down.
 */
describe("Notes GraphQL API (e2e)", () => {
  let app: INestApplication;

  const gql = (query: string, variables?: Record<string, unknown>) =>
    request(app.getHttpServer()).post("/graphql").send({ query, variables });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("reports readiness of Postgres, Mongo and Redis", async () => {
    const res = await request(app.getHttpServer()).get("/health/ready").expect(200);
    expect(res.body).toMatchObject({ status: "ok", postgres: "up", mongo: "up", redis: "up" });
  });

  it("creates, lists, fetches and deletes a note", async () => {
    const created = await gql(
      "mutation($i: CreateNoteInput!) { createNote(input: $i) { id title content summary { summary } } }",
      { i: { title: "  e2e note  ", content: "Written by the e2e test." } },
    ).expect(200);
    const note = created.body.data.createNote;
    expect(note).toMatchObject({ title: "e2e note", summary: null });

    const listed = await gql("{ notesList { id } }").expect(200);
    expect(listed.body.data.notesList.map((n: { id: string }) => n.id)).toContain(note.id);

    const fetched = await gql("query($id: ID!) { note(id: $id) { title } }", { id: note.id });
    expect(fetched.body.data.note.title).toBe("e2e note");

    const deleted = await gql("mutation($id: ID!) { deleteNote(id: $id) }", { id: note.id });
    expect(deleted.body.data.deleteNote).toBe(true);

    const listedAgain = await gql("{ notesList { id } }");
    expect(listedAgain.body.data.notesList.map((n: { id: string }) => n.id)).not.toContain(note.id);
  });

  it("rejects invalid input with BAD_USER_INPUT", async () => {
    const res = await gql('mutation { createNote(input: { title: "   ", content: "x" }) { id } }');
    expect(res.body.errors[0].extensions.code).toBe("BAD_USER_INPUT");

    const badId = await gql('{ note(id: "not-a-uuid") { id } }');
    expect(badId.body.errors[0].extensions.code).toBe("BAD_USER_INPUT");
  });

  it("returns NOT_FOUND for a missing note", async () => {
    const res = await gql('{ note(id: "00000000-0000-4000-8000-000000000000") { id } }');
    expect(res.body.errors[0].extensions.code).toBe("NOT_FOUND");
  });

  it("blocks CSRF-style simple requests", async () => {
    await request(app.getHttpServer())
      .post("/graphql")
      .set("content-type", "text/plain")
      .send('{"query":"{ notesList { id } }"}')
      .expect(400);
  });
});
