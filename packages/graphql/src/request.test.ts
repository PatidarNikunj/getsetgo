import { afterEach, describe, expect, it, vi } from "vitest";

import { DeleteNoteDocument } from "./generated/graphql";
import { describeError, GraphQLRequestError, requestGraphQL } from "./request";

const respond = (body: unknown, status = 200) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );

describe("requestGraphQL", () => {
  afterEach(() => vi.restoreAllMocks());

  it("posts the printed document and returns data", async () => {
    const fetchMock = respond({ data: { deleteNote: true } });

    const data = await requestGraphQL("/api/graphql", DeleteNoteDocument, { id: "n1" });

    expect(data.deleteNote).toBe(true);
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String(init?.body)) as { query: string; variables: unknown };
    expect(body.query).toContain("mutation DeleteNote");
    expect(body.variables).toEqual({ id: "n1" });
  });

  it("throws GraphQLRequestError with the API's error code", async () => {
    respond({
      data: null,
      errors: [{ message: "Note not found", extensions: { code: "NOT_FOUND" } }],
    });

    await expect(
      requestGraphQL("/api/graphql", DeleteNoteDocument, { id: "x" }),
    ).rejects.toMatchObject({
      message: "Note not found",
      code: "NOT_FOUND",
    });
  });

  it("handles non-JSON responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>", { status: 502 }));
    await expect(
      requestGraphQL("/api/graphql", DeleteNoteDocument, { id: "x" }),
    ).rejects.toMatchObject({
      code: "BAD_RESPONSE",
    });
  });
});

describe("describeError", () => {
  it("gives friendly messages", () => {
    expect(describeError(new GraphQLRequestError("x", "AI_UNAVAILABLE"))).toMatch(/unavailable/);
    expect(describeError(new Error("secret internals"))).toBe(
      "Something went wrong. Please try again.",
    );
  });
});
