import { CombinedGraphQLErrors } from "@apollo/client/errors";
import { describeError, GraphQLRequestError } from "@getsetgo/graphql";

/** Turns an Apollo error into the same friendly message web-shadcn shows. */
export function describeApolloError(error: unknown): string {
  if (CombinedGraphQLErrors.is(error)) {
    const [first] = error.errors;
    if (first) {
      const code = typeof first.extensions?.code === "string" ? first.extensions.code : "UNKNOWN";
      return describeError(new GraphQLRequestError(first.message, code));
    }
  }
  return describeError(error);
}
