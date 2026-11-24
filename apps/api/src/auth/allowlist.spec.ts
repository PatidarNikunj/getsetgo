import { Allowlist } from "./allowlist";

describe("Allowlist", () => {
  const list = new Allowlist(
    " Alice@Example.com, github:OctoCat, test:bob, test:e2e-*, *@evil.com ",
  );

  it("matches verified emails case-insensitively from any real provider", () => {
    expect(list.allows({ provider: "GOOGLE", email: "alice@example.COM" })).toBe(true);
    expect(list.allows({ provider: "GITHUB", email: "alice@example.com", login: "x" })).toBe(true);
    expect(list.allows({ provider: "GOOGLE", email: "mallory@example.com" })).toBe(false);
    expect(list.allows({ provider: "GOOGLE", email: null })).toBe(false);
  });

  it("matches GitHub logins only for GitHub", () => {
    expect(list.allows({ provider: "GITHUB", login: "octocat" })).toBe(true);
    expect(list.allows({ provider: "GOOGLE", login: "octocat" })).toBe(false);
  });

  it("supports test logins and test-only prefixes", () => {
    expect(list.allows({ provider: "TEST", login: "bob" })).toBe(true);
    expect(list.allows({ provider: "TEST", login: "e2e-123" })).toBe(true);
    expect(list.allows({ provider: "TEST", login: "mallory" })).toBe(false);
    // test: entries never let real-provider identities in, and emails don't let test users in.
    expect(list.allows({ provider: "GITHUB", login: "bob" })).toBe(false);
    expect(list.allows({ provider: "TEST", login: "zed", email: "alice@example.com" })).toBe(false);
  });

  it("ignores wildcard emails and allows nobody when empty", () => {
    expect(list.allows({ provider: "GOOGLE", email: "x@evil.com" })).toBe(false);
    expect(new Allowlist("").allows({ provider: "GOOGLE", email: "alice@example.com" })).toBe(
      false,
    );
  });
});
