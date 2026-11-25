import { PROVIDER_NAMES } from "@getsetgo/graphql";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DeleteAccountDialog } from "@/components/delete-account-dialog";
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
    <div className="page" style={{ maxWidth: "36rem" }}>
      <Typography variant="h4" component="h1">
        Account
      </Typography>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" component="h2" gutterBottom>
            Your details
          </Typography>
          <Typography color="text.secondary" gutterBottom>
            What this app stores about you, from your sign-in provider.
          </Typography>
          <dl className="details">
            {details.map(([label, value]) => (
              <div key={label} style={{ display: "contents" }}>
                <Typography component="dt" color="text.secondary">
                  {label}
                </Typography>
                <Typography component="dd">{value}</Typography>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <section aria-labelledby="danger-heading">
        <Typography variant="h6" component="h2" id="danger-heading" gutterBottom>
          Delete account
        </Typography>
        <Typography color="text.secondary" gutterBottom>
          Removes your account, every note and every AI summary, and signs you out on all devices.
        </Typography>
        <DeleteAccountDialog />
      </section>
    </div>
  );
}
