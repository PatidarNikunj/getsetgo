import type { Metadata } from "next";
import { safeReturnTo, signInMessages } from "@getsetgo/graphql";
import { CircleAlertIcon, InfoIcon } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { RECAPTCHA_SITE_KEY } from "@/components/recaptcha";
import { SignInButtons } from "@/components/sign-in-buttons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getSignInOptions, getViewer } from "@/lib/session.server";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  if (await getViewer()) redirect("/");

  const { error, notice } = signInMessages(params);
  const returnTo = safeReturnTo(params.returnTo);
  const options = await getSignInOptions();
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-muted-foreground">
          Your notes are private. Sign in to see and manage them.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" role="alert">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Couldn&apos;t sign you in</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert role="status">
          <InfoIcon aria-hidden="true" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {options && options.providers.length > 0 ? (
        <SignInButtons providers={options.providers} returnTo={returnTo} nonce={nonce} />
      ) : (
        <Alert role="status">
          <InfoIcon aria-hidden="true" />
          <AlertDescription>
            Sign-in is unavailable right now. Please try again soon.
          </AlertDescription>
        </Alert>
      )}

      {RECAPTCHA_SITE_KEY && options?.recaptcha && (
        <p className="text-sm text-muted-foreground">
          This site is protected by reCAPTCHA and the Google{" "}
          <a className="underline" href="https://policies.google.com/privacy">
            Privacy Policy
          </a>{" "}
          and{" "}
          <a className="underline" href="https://policies.google.com/terms">
            Terms of Service
          </a>{" "}
          apply.
        </p>
      )}
    </div>
  );
}
