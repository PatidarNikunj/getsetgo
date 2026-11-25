import {
  defaultShouldDehydrateQuery,
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { NoteForm } from "@/components/note-form";
import { NotesList } from "@/components/notes-list";
import { Skeleton } from "@/components/ui/skeleton";
import { notesQuery } from "@/lib/notes";
import { fetchNotesOnServer } from "@/lib/notes.server";
import { getViewer } from "@/lib/session.server";

export default async function NotesPage() {
  // proxy.ts already sent visitors without a session here only if they have one; still ask the
  // API (e.g. the account was just deleted in another browser).
  if (!(await getViewer())) redirect("/sign-in?error=expired");
  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="new-note-heading" className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold" id="new-note-heading">
          New note
        </h1>
        <NoteForm />
      </section>

      <section aria-labelledby="notes-heading" className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold" id="notes-heading">
          Your notes
        </h2>
        <Suspense fallback={<NotesSkeleton />}>
          <PrefetchedNotes />
        </Suspense>
      </section>
    </div>
  );
}

/**
 * Server Component: starts fetching on the server (not awaited, so the page shell streams first),
 * then hands the pending query to the browser cache, where NotesList picks it up.
 */
async function PrefetchedNotes() {
  // Notes are per-request, per-user data: never prerender them.
  await connection();
  const queryClient = new QueryClient();
  void queryClient.prefetchQuery({ ...notesQuery.options(), queryFn: fetchNotesOnServer });

  return (
    <HydrationBoundary
      state={dehydrate(queryClient, {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === "pending",
      })}
    >
      <NotesList />
    </HydrationBoundary>
  );
}

function NotesSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2" aria-hidden="true">
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </div>
  );
}
