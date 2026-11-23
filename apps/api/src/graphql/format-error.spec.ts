import { formatGraphQLError } from "./format-error";

const base = { message: "Bad Request Exception", path: ["createNote"] };

describe("formatGraphQLError", () => {
  it("turns Nest validation errors into BAD_USER_INPUT with the real messages", () => {
    const result = formatGraphQLError(
      {
        ...base,
        extensions: {
          code: "BAD_REQUEST",
          originalError: {
            message: ["title should not be empty", "content too long"],
            statusCode: 400,
          },
        },
      },
      { isProduction: true },
    );
    expect(result.message).toBe("title should not be empty; content too long");
    expect(result.extensions).toEqual({ code: "BAD_USER_INPUT" });
  });

  it("maps 404 to NOT_FOUND", () => {
    const result = formatGraphQLError(
      {
        message: "Note not found",
        extensions: {
          code: "INTERNAL_SERVER_ERROR",
          originalError: { message: "Note not found", statusCode: 404 },
        },
      },
      { isProduction: true },
    );
    expect(result.extensions).toEqual({ code: "NOT_FOUND" });
  });

  it("hides unexpected errors in production", () => {
    const result = formatGraphQLError(
      {
        message: "Invalid `prisma.note.findUnique()` invocation",
        extensions: { code: "INTERNAL_SERVER_ERROR", stacktrace: ["at db.ts:1"] },
      },
      { isProduction: true },
    );
    expect(result.message).toBe("Internal server error");
    expect(result.extensions).toEqual({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("keeps details for unexpected errors in development", () => {
    const result = formatGraphQLError(
      { message: "boom", extensions: { code: "INTERNAL_SERVER_ERROR", stacktrace: ["at x"] } },
      { isProduction: false },
    );
    expect(result.message).toBe("boom");
    expect(result.extensions?.stacktrace).toEqual(["at x"]);
  });

  it("passes custom codes through and strips stack traces in production", () => {
    const result = formatGraphQLError(
      { message: "AI down", extensions: { code: "AI_UNAVAILABLE", stacktrace: ["at y"] } },
      { isProduction: true },
    );
    expect(result).toEqual({ message: "AI down", extensions: { code: "AI_UNAVAILABLE" } });
  });
});
