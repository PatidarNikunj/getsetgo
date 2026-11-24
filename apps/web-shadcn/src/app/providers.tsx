"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setNonce } from "get-nonce";
import { type ReactNode, useEffect } from "react";

import { Toaster } from "@/components/ui/sonner";
import { useUiStore } from "@/stores/ui-store";

let browserQueryClient: QueryClient | undefined;

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });
}

/** A fresh client per server render (no data shared between users); one client in the browser. */
function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

/** Mirrors the Zustand theme choice onto <html data-theme>, which tokens.css reads. */
function ThemeSync() {
  const theme = useUiStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.dataset.theme = theme;
  }, [theme]);
  return null;
}

export function Providers({ children, nonce }: { children: ReactNode; nonce?: string }) {
  // Radix dialogs lock page scrolling with an injected <style>; give it the CSP nonce.
  if (nonce) setNonce(nonce);
  return (
    <QueryClientProvider client={getQueryClient()}>
      <ThemeSync />
      {children}
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  );
}
