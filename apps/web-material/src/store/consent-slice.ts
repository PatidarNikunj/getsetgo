import type { Consent } from "@getsetgo/consent";
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface ConsentState {
  /** null = the visitor hasn't chosen yet (show the banner). */
  consent: Consent | null;
  /** The banner is open: no decision yet, or reopened from "Cookie settings". */
  bannerOpen: boolean;
}

export const initialConsentState = (consent: Consent | null): ConsentState => ({
  consent,
  bannerOpen: consent === null,
});

/**
 * Cookie-consent state (Redux Toolkit). Reducers stay pure: writing the cookie and reloading
 * happen in the banner's click handler.
 */
export const consentSlice = createSlice({
  name: "consent",
  initialState: initialConsentState(null),
  reducers: {
    consentDecided(state, action: PayloadAction<Consent>) {
      state.consent = action.payload;
      state.bannerOpen = false;
    },
    consentSettingsOpened(state) {
      state.bannerOpen = true;
    },
  },
});

export const { consentDecided, consentSettingsOpened } = consentSlice.actions;
