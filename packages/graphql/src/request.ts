import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { print } from "graphql";

/** A GraphQL error returned by the API, with its `extensions.code` (e.g. BAD_USER_INPUT). */
export class GraphQLRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GraphQLRequestError";
  }
}

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: { message: string; extensions?: { code?: string } }[];
}

/**
 * Minimal typed GraphQL client on top of `fetch`, used with TanStack Query in web-shadcn.
 * (web-material uses Apollo Client instead.) Result and variable types come from the document.
 */
export async function requestGraphQL<TResult, TVariables extends Record<string, unknown>>(
  endpoint: string,
  document: TypedDocumentNode<TResult, TVariables>,
  variables?: TVariables,
  init?: RequestInit,
): Promise<TResult> {
  const response = await fetch(endpoint, {
    ...init,
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", ...init?.headers },
    body: JSON.stringify({ query: print(document), variables }),
  });

  let body: GraphQLResponse<TResult>;
  try {
    body = (await response.json()) as GraphQLResponse<TResult>;
  } catch {
    throw new GraphQLRequestError(
      "The server returned an invalid response.",
      "BAD_RESPONSE",
      response.status,
    );
  }

  const [firstError] = body.errors ?? [];
  if (firstError) {
    throw new GraphQLRequestError(
      firstError.message,
      firstError.extensions?.code ?? "UNKNOWN",
      response.status,
    );
  }
  if (!response.ok || body.data == null) {
    throw new GraphQLRequestError("The request failed.", "HTTP_ERROR", response.status);
  }
  return body.data;
}

/** User-facing message for any error thrown while talking to the API. */
export function describeError(error: unknown): string {
  if (error instanceof GraphQLRequestError) {
    if (error.code === "AI_UNAVAILABLE") return "AI summaries are unavailable right now.";
    if (error.code === "TOO_MANY_REQUESTS") return "Too many requests. Please wait a moment.";
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
