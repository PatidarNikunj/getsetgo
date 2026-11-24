"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Shown when a page section fails to load (for example, the API is down). */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <Alert variant="destructive" role="alert">
      <AlertTitle>Couldn’t load your notes</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>The server may be unavailable. Please try again in a moment.</p>
        <Button type="button" variant="outline" size="lg" onClick={reset}>
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}
