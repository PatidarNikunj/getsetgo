import { describe, expect, it, vi } from "vitest";

import { GraphQLRequestError } from "./request";
import { isUnauthenticated, refreshSession, safeReturnTo, signInMessages } from "./session";

describe("refreshSession", () => {
  it("sends one renewal for many simultaneous callers", async () => {
    let resolve: (r: Response) => void = () => {};
    const fetchFn = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
    const calls = [refreshSession(fetchFn), refreshSession(fetchFn), refreshSession(fetchFn)];
    resolve(new Response(null, { status: 204 }));
    await expect(Promise.all(calls)).resolves.toEqual([true, true, true]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/auth/refresh",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("reports failure and allows a later retry", async () => {
    const failing = vi.fn(() => Promise.resolve(new Response(null, { status: 401 })));
    await expect(refreshSession(failing)).resolves.toBe(false);
    const broken = vi.fn(() => Promise.reject(new Error("offline")));
    await expect(refreshSession(broken)).resolves.toBe(false);
    expect(broken).toHaveBeenCalledTimes(1);
  });
});

describe("helpers", () => {
  it("recognizes UNAUTHENTICATED errors", () => {
    expect(isUnauthenticated(new GraphQLRequestError("x", "UNAUTHENTICATED"))).toBe(true);
    expect(isUnauthenticated(new GraphQLRequestError("x", "NOT_FOUND"))).toBe(false);
    expect(isUnauthenticated(new Error("x"))).toBe(false);
  });

  it("maps sign-in page parameters to messages", () => {
    expect(signInMessages({ error: "invite_only" }).error).toMatch(/invite-only/);
    expect(signInMessages({ error: "<script>" }).error).toMatch(/didn't work/);
    expect(signInMessages({ signedOut: "1" }).notice).toBe("You're signed out.");
    expect(signInMessages({})).toEqual({ error: undefined, notice: undefined });
  });

  it("only keeps safe returnTo paths", () => {
    expect(safeReturnTo("/account")).toBe("/account");
    expect(safeReturnTo("//evil.example")).toBe("/");
    expect(safeReturnTo("https://evil.example")).toBe("/");
    expect(safeReturnTo("/sign-in?x")).toBe("/");
  });
});
