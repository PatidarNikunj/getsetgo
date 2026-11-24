import { safeReturnTo } from "./auth.controller";

describe("safeReturnTo", () => {
  it.each(["/", "/account", "/notes?x=1"])("keeps same-site path %s", (path) => {
    expect(safeReturnTo(path)).toBe(path);
  });

  it.each([
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "javascript:alert(1)",
    "",
    5,
    "/a b",
  ])("replaces %p with /", (value) => {
    expect(safeReturnTo(value)).toBe("/");
  });
});
