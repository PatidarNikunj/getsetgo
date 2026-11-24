import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * false during server rendering and before hydration, true once React runs in the browser.
 * Used to keep submit buttons disabled until clicks are handled by JavaScript: a native form
 * submit before hydration would reload the page and put the note text in the URL.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
