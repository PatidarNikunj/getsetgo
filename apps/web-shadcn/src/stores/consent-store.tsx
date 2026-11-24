"use client";

import { type Consent, consentCookieString, createConsent } from "@getsetgo/consent";
import { createContext, type ReactNode, useContext, useState } from "react";
import { createStore, type StoreApi, useStore } from "zustand";

interface ConsentState {
  /** null = the visitor hasn't chosen yet (show the banner). */
  consent: Consent | null;
  /** The banner is open: no decision yet, or reopened from "Cookie settings". */
  bannerOpen: boolean;
  decide: (analytics: boolean) => void;
  openSettings: () => void;
}

/** Removes Google Analytics' cookies (`_ga`, `_ga_<id>`) when analytics is withdrawn. */
function clearAnalyticsCookies() {
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim();
    if (!name?.startsWith("_ga")) continue;
    const host = location.hostname;
    for (const domain of [
      "",
      `; domain=${host}`,
      `; domain=.${host.split(".").slice(-2).join(".")}`,
    ]) {
      document.cookie = `${name}=; Max-Age=0; Path=/${domain}`;
    }
  }
}

/**
 * A Zustand store per request (Zustand's Next.js pattern): a module-level store would be shared
 * by every visitor during server rendering. It starts from the consent cookie read on the server.
 */
function createConsentStore(initial: Consent | null): StoreApi<ConsentState> {
  return createStore<ConsentState>()((set, get) => ({
    consent: initial,
    bannerOpen: initial === null,
    decide: (analytics) => {
      const hadAnalytics = get().consent?.analytics === true;
      const consent = createConsent(analytics);
      document.cookie = consentCookieString(consent, { secure: location.protocol === "https:" });
      set({ consent, bannerOpen: false });
      if (hadAnalytics && !analytics) {
        // gtag.js can't be unloaded: drop its cookies and reload without it.
        clearAnalyticsCookies();
        location.reload();
      }
    },
    openSettings: () => set({ bannerOpen: true }),
  }));
}

const ConsentContext = createContext<StoreApi<ConsentState> | null>(null);

export function ConsentProvider({
  initial,
  children,
}: {
  initial: Consent | null;
  children: ReactNode;
}) {
  const [store] = useState(() => createConsentStore(initial));
  return <ConsentContext.Provider value={store}>{children}</ConsentContext.Provider>;
}

export function useConsent<T>(selector: (state: ConsentState) => T): T {
  const store = useContext(ConsentContext);
  if (!store) throw new Error("useConsent must be used inside <ConsentProvider>");
  return useStore(store, selector);
}
