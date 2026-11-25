"use client";

import { ApolloLink, HttpLink } from "@apollo/client";
import { CombinedGraphQLErrors } from "@apollo/client/errors";
import { ErrorLink } from "@apollo/client/link/error";
import {
  ApolloClient,
  ApolloNextAppProvider,
  InMemoryCache,
} from "@apollo/client-integration-nextjs";
import type { Consent } from "@getsetgo/consent";
import { goToSignIn, GRAPHQL_PATH, refreshSession } from "@getsetgo/graphql";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider, useColorScheme } from "@mui/material/styles";
import { type ReactNode, useEffect, useState } from "react";
import { Provider as ReduxProvider } from "react-redux";
import { from, switchMap } from "rxjs";

import { NotificationSnackbar } from "@/components/notification-snackbar";
import { makeStore, useAppSelector } from "@/store/store";
import { theme } from "@/theme";

/**
 * When the 15-minute access cookie has expired, renew the session once (shared with any other
 * request doing the same) and retry. If renewal fails, go to sign-in; drafts stay in IndexedDB.
 */
const renewSessionLink = new ErrorLink(({ error, operation, forward }) => {
  const unauthenticated =
    CombinedGraphQLErrors.is(error) &&
    error.errors.some((e) => e.extensions?.code === "UNAUTHENTICATED");
  if (!unauthenticated || typeof window === "undefined") return;
  return from(refreshSession()).pipe(
    switchMap((renewed) => {
      if (!renewed) goToSignIn();
      return forward(operation);
    }),
  );
});

function makeApolloClient() {
  // During SSR this runs on the server (no relative URLs there), in the browser it uses the proxy.
  const uri =
    typeof window === "undefined"
      ? `${(process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "")}/graphql`
      : GRAPHQL_PATH;
  return new ApolloClient({
    cache: new InMemoryCache({
      typePolicies: {
        Query: {
          fields: {
            // A refetched list replaces the old one (no merging of pages).
            notesList: { keyArgs: ["page"], merge: (_existing, incoming: unknown[]) => incoming },
          },
        },
      },
    }),
    link: ApolloLink.from([renewSessionLink, new HttpLink({ uri })]),
  });
}

/** Keeps MUI's color scheme in step with the theme choice stored in Redux. */
function ThemeSync() {
  const preference = useAppSelector((s) => s.ui.theme);
  const { setMode } = useColorScheme();
  useEffect(() => setMode(preference), [preference, setMode]);
  return null;
}

export function Providers({
  children,
  nonce,
  consent,
}: {
  children: ReactNode;
  nonce?: string;
  consent: Consent | null;
}) {
  const [store] = useState(() => makeStore({ consent }));
  return (
    // MUI's Emotion styles are <style> tags: they need the CSP nonce.
    <AppRouterCacheProvider options={{ key: "mui", nonce }}>
      <ThemeProvider theme={theme} defaultMode="system">
        <CssBaseline enableColorScheme />
        <ReduxProvider store={store}>
          {/* Apollo streams server-fetched data in inline <script> tags: they need the nonce too. */}
          <ApolloNextAppProvider makeClient={makeApolloClient} extraScriptProps={{ nonce }}>
            <ThemeSync />
            {children}
            <NotificationSnackbar />
          </ApolloNextAppProvider>
        </ReduxProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
