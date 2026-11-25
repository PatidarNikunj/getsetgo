import "server-only";

import { AUTH_COOKIES, MeDocument, type MeQuery, requestGraphQL } from "@getsetgo/graphql";
import { cookies, headers } from "next/headers";
import { cache } from "react";

export const apiUrl = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export type Viewer = MeQuery["me"];

/** Only our two auth cookies go to the API from the server (never analytics or other cookies). */
export async function authCookieHeader(): Promise<string> {
  const jar = await cookies();
  return Object.values(AUTH_COOKIES)
    .map((name) => {
      const value = jar.get(name)?.value;
      return value ? `${name}=${value}` : undefined;
    })
    .filter(Boolean)
    .join("; ");
}

/** Server-side GraphQL straight to the API, as the signed-in user. */
export async function serverGraphQL<TResult, TVariables extends Record<string, unknown>>(
  document: Parameters<typeof requestGraphQL<TResult, TVariables>>[1],
  variables?: TVariables,
): Promise<TResult> {
  return requestGraphQL(`${apiUrl}/graphql`, document, variables, {
    headers: { cookie: await authCookieHeader() },
    cache: "no-store",
  });
}

/** The signed-in user, or null. Cached per request (layout and page share one call). */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  if (!(await authCookieHeader())) return null;
  try {
    return (await serverGraphQL(MeDocument)).me;
  } catch {
    return null;
  }
});

/** This web app's own origin (the API uses it to pick the matching OAuth app and callback). */
export async function webOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3001";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export interface SignInOptions {
  providers: ("google" | "github" | "test")[];
  recaptcha: boolean;
}

/** Which sign-in buttons to show; an unreachable API shows none (and an "unavailable" note). */
export async function getSignInOptions(): Promise<SignInOptions | null> {
  try {
    const origin = encodeURIComponent(await webOrigin());
    const res = await fetch(`${apiUrl}/auth/providers?origin=${origin}`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as SignInOptions) : null;
  } catch {
    return null;
  }
}
