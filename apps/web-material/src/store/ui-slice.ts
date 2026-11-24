import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type ThemePreference = "system" | "light" | "dark";
export type Severity = "success" | "error" | "info";

export interface Notification {
  id: number;
  message: string;
  severity: Severity;
}

interface UiState {
  theme: ThemePreference;
  notification: Notification | null;
}

const initialState: UiState = { theme: "system", notification: null };

let nextId = 1;

/**
 * Client-only UI state (Redux Toolkit). Server data lives in Apollo Client's cache, not here.
 * - theme: the user's color-scheme choice
 * - notification: the message shown in the snackbar
 */
export const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    themeChanged(state, action: PayloadAction<ThemePreference>) {
      state.theme = action.payload;
    },
    notify: {
      reducer(state, action: PayloadAction<Notification>) {
        state.notification = action.payload;
      },
      prepare(message: string, severity: Severity = "success") {
        return { payload: { id: nextId++, message, severity } };
      },
    },
    notificationDismissed(state) {
      state.notification = null;
    },
  },
});

export const { themeChanged, notify, notificationDismissed } = uiSlice.actions;
