import type { Consent } from "@getsetgo/consent";
import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";

import { consentSlice, initialConsentState } from "./consent-slice";
import { uiSlice } from "./ui-slice";

const rootReducer = combineReducers({ ui: uiSlice.reducer, consent: consentSlice.reducer });

/**
 * A new store per request on the server (no state shared between users), one in the browser.
 * The consent cookie, read on the server, is preloaded so the banner never flashes.
 */
export const makeStore = ({ consent = null }: { consent?: Consent | null } = {}) =>
  configureStore({
    reducer: rootReducer,
    preloadedState: { consent: initialConsentState(consent) },
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = AppStore["dispatch"];

// Typed hooks: use these instead of plain useDispatch/useSelector.
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
