"use client";

import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";

/** Shown when a page section fails to load (for example, the API is down). */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <Alert
      severity="error"
      action={
        <Button color="inherit" onClick={reset}>
          Try again
        </Button>
      }
    >
      <AlertTitle>Couldn’t load your notes</AlertTitle>
      The server may be unavailable. Please try again in a moment.
    </Alert>
  );
}
