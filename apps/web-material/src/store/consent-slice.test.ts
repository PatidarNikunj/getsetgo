import { createConsent } from "@getsetgo/consent";
import { describe, expect, it } from "vitest";

import { consentDecided, consentSettingsOpened } from "./consent-slice";
import { makeStore } from "./store";

describe("consent slice", () => {
  it("opens the banner when there's no decision yet", () => {
    expect(makeStore().getState().consent).toEqual({ consent: null, bannerOpen: true });
  });

  it("starts closed when the server read a consent cookie", () => {
    const store = makeStore({ consent: createConsent(false) });
    expect(store.getState().consent.bannerOpen).toBe(false);
  });

  it("records a decision and can reopen the settings", () => {
    const store = makeStore();
    store.dispatch(consentDecided(createConsent(true)));
    expect(store.getState().consent.consent?.analytics).toBe(true);
    expect(store.getState().consent.bannerOpen).toBe(false);

    store.dispatch(consentSettingsOpened());
    expect(store.getState().consent.bannerOpen).toBe(true);
  });
});
