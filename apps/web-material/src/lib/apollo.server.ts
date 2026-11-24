import "server-only";

import { HttpLink } from "@apollo/client";
import {
  ApolloClient,
  InMemoryCache,
  registerApolloClient,
} from "@apollo/client-integration-nextjs";

const apiUrl = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");

/**
 * Apollo Client for React Server Components. One instance per request; `PreloadQuery` uses it to
 * fetch on the server and stream the result into the browser's Apollo cache.
 */
export const { getClient, query, PreloadQuery } = registerApolloClient(
  () =>
    new ApolloClient({
      cache: new InMemoryCache(),
      // Server to server: call the API directly, not through the /api/graphql proxy.
      link: new HttpLink({ uri: `${apiUrl}/graphql`, fetchOptions: { cache: "no-store" } }),
    }),
);
