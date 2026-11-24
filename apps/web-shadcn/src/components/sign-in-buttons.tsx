"use client";

import { AUTH_PATH, PROVIDER_LABELS, type ProviderId } from "@getsetgo/graphql";
import Script from "next/script";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";

import { RECAPTCHA_SITE_KEY, recaptchaScriptSrc, recaptchaToken } from "./recaptcha";

/**
 * One native form per provider: sign-in works even before React hydrates. With reCAPTCHA on, the
 * invisible token is added just before the form is submitted (WCAG 3.3.8: no puzzles).
 */
export function SignInButtons({
  providers,
  returnTo,
  nonce,
}: {
  providers: ProviderId[];
  returnTo: string;
  nonce?: string;
}) {
  const [pending, setPending] = useState<ProviderId | null>(null);

  async function addRecaptchaToken(event: FormEvent<HTMLFormElement>, provider: ProviderId) {
    setPending(provider);
    if (!RECAPTCHA_SITE_KEY) return; // no bot check configured: submit as is
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const input = form.elements.namedItem("recaptchaToken") as HTMLInputElement;
      input.value = await recaptchaToken(RECAPTCHA_SITE_KEY);
    } catch {
      // Submit anyway; the API answers with a friendly "try again" message.
    }
    form.submit();
  }

  return (
    <>
      {RECAPTCHA_SITE_KEY && (
        <Script
          src={recaptchaScriptSrc(RECAPTCHA_SITE_KEY)}
          nonce={nonce}
          strategy="afterInteractive"
        />
      )}
      <ul className="flex flex-col gap-3">
        {providers.map((provider) => (
          <li key={provider}>
            <form
              method="post"
              action={`${AUTH_PATH}/${provider}/start`}
              onSubmit={(event) => void addRecaptchaToken(event, provider)}
            >
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="recaptchaToken" value="" />
              <Button
                type="submit"
                size="lg"
                variant={provider === "test" ? "outline" : "default"}
                className="w-full"
                disabled={pending !== null}
                aria-busy={pending === provider}
              >
                {PROVIDER_LABELS[provider]}
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </>
  );
}
