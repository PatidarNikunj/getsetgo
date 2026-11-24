import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ThemePreference = "system" | "light" | "dark";

interface UiState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

/**
 * Client-only UI state (Zustand). Server data lives in TanStack Query, not here.
 * The theme choice is saved in localStorage and applied as <html data-theme="...">.
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: "system",
      setTheme: (theme) => set({ theme }),
    }),
    { name: "gsg-ui", storage: createJSONStorage(() => localStorage) },
  ),
);
