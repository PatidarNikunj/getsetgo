import "server-only";

import { ApolloLink, HttpLink } from "@apollo/client";
import { SetContextLink } from "@apollo/client/link/context";
import {
  ApolloClient,
  InMemoryCache,
  registerApolloClient,
} from "@apollo/client-integration-nextjs";

import { apiUrl, authCookieHeader } from "./session.server";

/**
 * Apollo Client for React Server Components. One instance per request; `PreloadQuery` uses it to
 * fetch on the server and stream the result into the browser's Apollo cache. It calls the API
 * directly (server to server) as the signed-in user: only the two session cookies are forwarded.
 */
export const { getClient, query, PreloadQuery } = registerApolloClient(
  () =>
    new ApolloClient({
      cache: new InMemoryCache(),
      link: ApolloLink.from([
        new SetContextLink(async (prevContext) => ({
          headers: { ...prevContext.headers, cookie: await authCookieHeader() },
        })),
        new HttpLink({ uri: `${apiUrl}/graphql`, fetchOptions: { cache: "no-store" } }),
      ]),
    }),
);
