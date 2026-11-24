import "./globals.css";

import type { Metadata } from "next";
import { headers } from "next/headers";

import { ThemeToggle } from "@/components/theme-toggle";

import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "Notes · getsetgo (shadcn)", template: "%s · getsetgo (shadcn)" },
  description:
    "Notes with AI summaries, built with shadcn/ui, Tailwind, TanStack Query and Zustand.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading request headers renders every page per request, so Next.js can apply the CSP nonce
  // that proxy.ts generated to all of its scripts. Client libraries that add <style> tags get it too.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {/* WCAG 2.4.1: let keyboard users jump past the header. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2"
        >
          Skip to content
        </a>
        <Providers nonce={nonce}>
          <header className="border-b">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
              <p className="text-lg font-semibold">
                getsetgo <span className="text-muted-foreground">· shadcn/ui</span>
              </p>
              <ThemeToggle />
            </div>
          </header>
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
