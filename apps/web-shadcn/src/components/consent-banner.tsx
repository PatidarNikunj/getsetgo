"use client";

import { Button } from "@/components/ui/button";
import { useConsent } from "@/stores/consent-store";

/**
 * Cookie consent. Not a modal (it doesn't block the page); "Reject" is exactly as easy as
 * "Accept" (GDPR); analytics stays off until the visitor accepts.
 */
export function ConsentBanner() {
  const open = useConsent((s) => s.bannerOpen);
  const decide = useConsent((s) => s.decide);
  if (!open) return null;

  return (
    <section
      aria-labelledby="consent-title"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card p-4 shadow-lg"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id="consent-title" className="font-semibold">
            Cookie preferences
          </h2>
          <p className="text-sm text-muted-foreground">
            We’d like to use Google Analytics cookies to understand how the app is used. Error
            reports and basic performance stats are cookieless and always on. Your notes are never
            shared.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" size="lg" variant="outline" onClick={() => decide(false)}>
            Reject analytics
          </Button>
          <Button type="button" size="lg" onClick={() => decide(true)}>
            Accept analytics
          </Button>
        </div>
      </div>
    </section>
  );
}

/** Reopens the banner so the visitor can change their mind at any time (GDPR art. 7(3)). */
export function CookieSettingsButton() {
  const openSettings = useConsent((s) => s.openSettings);
  return (
    <Button type="button" variant="link" size="lg" onClick={openSettings}>
      Cookie settings
    </Button>
  );
}
