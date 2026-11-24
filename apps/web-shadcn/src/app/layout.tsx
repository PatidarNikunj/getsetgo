import "./globals.css";

import type { Metadata } from "next";
import { consentFromCookieHeader } from "@getsetgo/consent";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { headers } from "next/headers";
import Link from "next/link";

import { ConsentBanner, CookieSettingsButton } from "@/components/consent-banner";
import { GoogleAnalytics } from "@/components/google-analytics";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { getViewer } from "@/lib/session.server";

import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "Notes · getsetgo (shadcn)", template: "%s · getsetgo (shadcn)" },
  description:
    "Notes with AI summaries, built with shadcn/ui, Tailwind, TanStack Query and Zustand.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading request headers renders every page per request, so Next.js can apply the CSP nonce
  // that proxy.ts generated to all of its scripts. Client libraries that add <style> tags get it too.
  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  // Read on the server, so the banner and Google Analytics render correctly without a flash.
  const consent = consentFromCookieHeader(requestHeaders.get("cookie"));
  const viewer = await getViewer();
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
        <Providers nonce={nonce} consent={consent}>
          <header className="border-b">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
              <p className="text-lg font-semibold">
                <Link href="/">
                  getsetgo <span className="text-muted-foreground">· shadcn/ui</span>
                </Link>
              </p>
              <div className="flex items-center gap-2">
                <ThemeToggle />
                {viewer && <UserMenu viewer={viewer} />}
              </div>
            </div>
          </header>
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
            {children}
          </main>
          <footer className="border-t">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-2 text-sm text-muted-foreground">
              <p>A getsetgo learning project.</p>
              <CookieSettingsButton />
            </div>
          </footer>
          <ConsentBanner />
          <GoogleAnalytics nonce={nonce} />
        </Providers>
        {/* Cookieless Vercel Web Analytics + Speed Insights, only when deployed on Vercel. */}
        {process.env.VERCEL && (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        )}
      </body>
    </html>
  );
}
