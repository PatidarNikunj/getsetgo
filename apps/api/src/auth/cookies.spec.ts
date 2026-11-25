import type { Response } from "express";

import {
  ACCESS_COOKIE,
  clearSessionCookies,
  readCookie,
  REFRESH_COOKIE,
  setSessionCookies,
} from "./cookies";

function fakeResponse() {
  const cookies: Array<[string, string, Record<string, unknown>]> = [];
  const cleared: string[] = [];
  const headers: Record<string, string> = {};
  const res = {
    cookie: (name: string, value: string, options: Record<string, unknown>) =>
      cookies.push([name, value, options]),
    clearCookie: (name: string) => cleared.push(name),
    setHeader: (name: string, value: string) => (headers[name] = value),
  } as unknown as Response;
  return { res, cookies, cleared, headers };
}

describe("session cookies", () => {
  it("are httpOnly, Secure, SameSite=Lax, Path=/ with the right lifetimes", () => {
    const { res, cookies, headers } = fakeResponse();
    setSessionCookies(res, { accessToken: "a", refreshToken: "r" });
    const [access, refresh] = cookies;
    expect(access?.[0]).toBe(ACCESS_COOKIE);
    expect(access?.[2]).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60 * 1000,
    });
    expect(refresh?.[0]).toBe(REFRESH_COOKIE);
    expect(refresh?.[2]).toMatchObject({ httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
    expect(headers["Cache-Control"]).toBe("no-store");
  });

  it("uses __Host- names and clears both", () => {
    expect(ACCESS_COOKIE.startsWith("__Host-")).toBe(true);
    expect(REFRESH_COOKIE.startsWith("__Host-")).toBe(true);
    const { res, cleared } = fakeResponse();
    clearSessionCookies(res);
    expect(cleared).toEqual([ACCESS_COOKIE, REFRESH_COOKIE]);
  });

  it("reads only non-empty string cookies", () => {
    expect(readCookie({ cookies: { a: "x" } }, "a")).toBe("x");
    expect(readCookie({ cookies: { a: "" } }, "a")).toBeUndefined();
    expect(readCookie({ cookies: { a: { j: 1 } } }, "a")).toBeUndefined();
    expect(readCookie({}, "a")).toBeUndefined();
  });
});
