import "./globals.css";

import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import type { Metadata } from "next";
import { headers } from "next/headers";

import { ThemeToggle } from "@/components/theme-toggle";

import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "Notes · getsetgo (Material)", template: "%s · getsetgo (Material)" },
  description:
    "Notes with AI summaries, built with Material UI, Apollo Client, Redux Toolkit and Formik.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading request headers renders every page per request, so Next.js can apply the CSP nonce
  // that proxy.ts generated. MUI's styles and color-scheme script need it too.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Sets .light/.dark on <html> before paint, so there's no flash of the wrong theme. */}
        <InitColorSchemeScript attribute="class" defaultMode="system" nonce={nonce} />
        {/* WCAG 2.4.1: let keyboard users jump past the header. */}
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Providers nonce={nonce}>
          <header className="site-header">
            <div className="container header-row">
              <p className="brand">
                getsetgo <span className="brand-muted">· Material UI</span>
              </p>
              <ThemeToggle />
            </div>
          </header>
          <main id="main" tabIndex={-1} className="container main">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
