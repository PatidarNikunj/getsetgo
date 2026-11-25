import type { GraphQLFormattedError } from "graphql";

const CODE_BY_STATUS: Record<number, string> = {
  400: "BAD_USER_INPUT",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "TOO_MANY_REQUESTS",
};

interface NestOriginalError {
  message?: string | string[];
  statusCode?: number;
}

/**
 * Shapes every GraphQL error sent to clients:
 * - Nest HTTP exceptions get a meaningful code and their real message (e.g. validation details).
 * - Unexpected errors are replaced by a generic message in production, so database or stack
 *   details never leak (OWASP A05). They're still logged server-side.
 */
export function formatGraphQLError(
  formatted: GraphQLFormattedError,
  { isProduction }: { isProduction: boolean },
): GraphQLFormattedError {
  const { originalError, stacktrace, ...extensions } = (formatted.extensions ?? {}) as Record<
    string,
    unknown
  > & { originalError?: NestOriginalError };

  // Nest exceptions carry the status on originalError; some (e.g. the throttler's) only on
  // extensions.status.
  const status =
    originalError?.statusCode ??
    (typeof extensions.status === "number" ? extensions.status : undefined);
  if (status !== undefined && status < 500) {
    const message = Array.isArray(originalError?.message)
      ? originalError.message.join("; ")
      : (originalError?.message ?? formatted.message);
    return {
      ...formatted,
      message,
      extensions: { code: CODE_BY_STATUS[status] ?? "BAD_REQUEST" },
    };
  }

  if (extensions.code === "INTERNAL_SERVER_ERROR" || status !== undefined) {
    return {
      ...formatted,
      message: isProduction ? "Internal server error" : formatted.message,
      extensions: isProduction ? { code: "INTERNAL_SERVER_ERROR" } : { ...extensions, stacktrace },
    };
  }

  // Known GraphQL errors (validation, AI_* codes, ...) pass through unchanged.
  return { ...formatted, extensions: isProduction ? extensions : { ...extensions, stacktrace } };
}
