import "./globals.css";

import { consentFromCookieHeader } from "@getsetgo/consent";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { ConsentBanner, CookieSettingsButton } from "@/components/consent-banner";
import { GoogleAnalytics } from "@/components/google-analytics";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { getViewer } from "@/lib/session.server";

import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "Notes · getsetgo (Material)", template: "%s · getsetgo (Material)" },
  description:
    "Notes with AI summaries, built with Material UI, Apollo Client, Redux Toolkit and Formik.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading request headers renders every page per request, so Next.js can apply the CSP nonce
  // that proxy.ts generated. MUI's styles and color-scheme script need it too.
  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  // Read on the server, so the banner and Google Analytics render correctly without a flash.
  const consent = consentFromCookieHeader(requestHeaders.get("cookie"));
  const viewer = await getViewer();
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Sets .light/.dark on <html> before paint, so there's no flash of the wrong theme. */}
        <InitColorSchemeScript attribute="class" defaultMode="system" nonce={nonce} />
        {/* WCAG 2.4.1: let keyboard users jump past the header. */}
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Providers nonce={nonce} consent={consent}>
          <header className="site-header">
            <div className="container header-row">
              <p className="brand">
                <Link href="/" className="brand-link">
                  getsetgo <span className="brand-muted">· Material UI</span>
                </Link>
              </p>
              <div className="header-actions">
                <ThemeToggle />
                {viewer && <UserMenu viewer={viewer} />}
              </div>
            </div>
          </header>
          <main id="main" tabIndex={-1} className="container main">
            {children}
          </main>
          <footer className="site-footer">
            <div className="container footer-row">
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
