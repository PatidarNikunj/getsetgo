import {
  DeleteAccountDocument,
  GRAPHQL_PATH,
  requestGraphQL,
  SignOutEverywhereDocument,
  withSessionRetry,
} from "@getsetgo/graphql";

export const signOutEverywhere = () =>
  withSessionRetry(() => requestGraphQL(GRAPHQL_PATH, SignOutEverywhereDocument)).then(
    (d) => d.signOutEverywhere,
  );

export const deleteAccount = () =>
  withSessionRetry(() => requestGraphQL(GRAPHQL_PATH, DeleteAccountDocument)).then(
    (d) => d.deleteAccount,
  );
