export * from "./generated/graphql";
export { describeError, GraphQLRequestError, requestGraphQL } from "./request";
export * from "./session";

/** Same-origin path the browser uses; each Next.js app proxies it to the API. */
export const GRAPHQL_PATH = "/api/graphql";

/** Limits shared by both apps' forms; they mirror the API's validation rules. */
export const NOTE_LIMITS = { titleMax: 200, contentMax: 20_000 } as const;
