import { redactAuthRequest, scrubAuthUrls, stripAuthQuery } from "./scrub";

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

  it("logs sign-in requests without the code or state (URL and parsed query)", () => {
    const logged = redactAuthRequest({
      method: "GET",
      url: "/auth/test/callback?state=s&code=c",
      query: { state: "s", code: "c" },
    });
    expect(logged).toEqual({ method: "GET", url: "/auth/test/callback", query: "[redacted]" });
    expect(JSON.stringify(logged)).not.toMatch(/code=|"c"/);
    const other = { url: "/graphql", query: { a: "1" } };
    expect(redactAuthRequest(other)).toBe(other);
  });
});
