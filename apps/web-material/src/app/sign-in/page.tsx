import { safeReturnTo, signInMessages } from "@getsetgo/graphql";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { RECAPTCHA_SITE_KEY } from "@/components/recaptcha";
import { SignInButtons } from "@/components/sign-in-buttons";
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
    <div className="narrow">
      <div>
        <Typography variant="h4" component="h1" gutterBottom>
          Sign in
        </Typography>
        <Typography color="text.secondary">
          Your notes are private. Sign in to see and manage them.
        </Typography>
      </div>

      {error && (
        <Alert severity="error" role="alert">
          <AlertTitle>Couldn&apos;t sign you in</AlertTitle>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="info" role="status">
          {notice}
        </Alert>
      )}

      {options && options.providers.length > 0 ? (
        <SignInButtons providers={options.providers} returnTo={returnTo} nonce={nonce} />
      ) : (
        <Alert severity="info" role="status">
          Sign-in is unavailable right now. Please try again soon.
        </Alert>
      )}

      {RECAPTCHA_SITE_KEY && options?.recaptcha && (
        <Typography variant="body2" color="text.secondary">
          This site is protected by reCAPTCHA and the Google{" "}
          <Link href="https://policies.google.com/privacy">Privacy Policy</Link> and{" "}
          <Link href="https://policies.google.com/terms">Terms of Service</Link> apply.
        </Typography>
      )}
    </div>
  );
}
