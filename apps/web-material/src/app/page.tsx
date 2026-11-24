import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { connection } from "next/server";
import { Suspense } from "react";

import { NoteForm } from "@/components/note-form";
import { NotesList } from "@/components/notes-list";
import { PreloadQuery } from "@/lib/apollo.server";
import { notesListQuery } from "@/lib/notes";

export default async function NotesPage() {
  // Notes are per-request data (and per-user once login exists): never prerender them.
  await connection();
  return (
    <div className="page">
      <section aria-labelledby="new-note-heading">
        <Typography variant="h4" component="h1" id="new-note-heading" gutterBottom>
          New note
        </Typography>
        <NoteForm />
      </section>

      <section aria-labelledby="notes-heading">
        <Typography variant="h5" component="h2" id="notes-heading" gutterBottom>
          Your notes
        </Typography>
        {/* Fetch on the server and stream the result into the browser's Apollo cache. */}
        <PreloadQuery query={notesListQuery.query} variables={notesListQuery.variables}>
          <Suspense fallback={<NotesSkeleton />}>
            <NotesList />
          </Suspense>
        </PreloadQuery>
      </section>
    </div>
  );
}

function NotesSkeleton() {
  return (
    <div className="notes-grid" aria-hidden="true">
      <Skeleton variant="rounded" height={160} />
      <Skeleton variant="rounded" height={160} />
    </div>
  );
}
