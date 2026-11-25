import type { Metadata } from "next";
import { PROVIDER_NAMES } from "@getsetgo/graphql";
import { redirect } from "next/navigation";

import { DeleteAccountDialog } from "@/components/delete-account-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getViewer } from "@/lib/session.server";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?returnTo=%2Faccount");

  const created = new Date(viewer.createdAt).toLocaleDateString("en", { dateStyle: "long" });
  const details: [string, string][] = [
    ["Name", viewer.displayName],
    viewer.email ? ["Email", viewer.email] : ["Username", viewer.login ?? "—"],
    ["Signed in with", PROVIDER_NAMES[viewer.provider]],
    ["Account created", created],
  ];

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <h1 className="text-2xl font-semibold">Account</h1>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Your details</h2>
          </CardTitle>
          <CardDescription>
            What this app stores about you, from your sign-in provider.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
            {details.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="break-all">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <section aria-labelledby="danger-heading" className="flex flex-col items-start gap-3">
        <h2 id="danger-heading" className="text-lg font-semibold">
          Delete account
        </h2>
        <p className="text-muted-foreground">
          Removes your account, every note and every AI summary, and signs you out on all devices.
        </p>
        <DeleteAccountDialog />
      </section>
    </div>
  );
}
