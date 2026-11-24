"use client";

import { GA_SCRIPT_ORIGIN, gaBootstrapScript, isValidMeasurementId } from "@getsetgo/observability";
import Script from "next/script";

import { useConsent } from "@/stores/consent-store";

const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

/**
 * Loads Google Analytics only after the visitor accepts analytics: before that, no request goes
 * to Google at all. Both scripts carry the CSP nonce.
 */
export function GoogleAnalytics({ nonce }: { nonce?: string }) {
  const analytics = useConsent((s) => s.consent?.analytics === true);
  if (!analytics || !isValidMeasurementId(measurementId)) return null;

  return (
    <>
      <Script id="ga-bootstrap" nonce={nonce} strategy="afterInteractive">
        {gaBootstrapScript(measurementId)}
      </Script>
      <Script
        id="ga-gtag"
        nonce={nonce}
        strategy="afterInteractive"
        src={`${GA_SCRIPT_ORIGIN}/gtag/js?id=${measurementId}`}
      />
    </>
  );
}
