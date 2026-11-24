import { scrubAuthUrls, stripAuthQuery } from "./scrub";

describe("auth URL redaction", () => {
  it("drops the query string of sign-in URLs only", () => {
    expect(stripAuthQuery("/auth/google/callback?code=secret&state=abc")).toBe(
      "/auth/google/callback",
    );
    expect(stripAuthQuery("https://web.example/api/auth/github/callback?code=x")).toBe(
      "https://web.example/api/auth/github/callback",
    );
    expect(stripAuthQuery("/graphql?x=1")).toBe("/graphql?x=1");
    expect(stripAuthQuery("/health")).toBe("/health");
  });

  it("cleans Sentry events", () => {
    const event = {
      request: { url: "/auth/test/callback?code=c&state=s", query_string: "code=c" },
    };
    expect(scrubAuthUrls(event)).toEqual({ request: { url: "/auth/test/callback" } });
    expect(scrubAuthUrls({})).toEqual({});
  });
});
