"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { useHydrated } from "@/hooks/use-hydrated";
import { notesQuery } from "@/lib/notes";

import { NoteCard } from "./note-card";

/** Reads the notes the server already fetched (hydrated cache), then keeps them up to date. */
export function NotesList() {
  const { data: notes, isFetching } = useSuspenseQuery(notesQuery.options());
  // The server never renders "Updating…"; matching it during hydration avoids a text mismatch.
  const updating = useHydrated() && isFetching;

  if (notes.length === 0) {
    return <p className="text-muted-foreground">No notes yet. Write your first one above.</p>;
  }

  return (
    <>
      <p className="sr-only" aria-live="polite">
        {updating ? "Updating notes…" : `${notes.length} notes`}
      </p>
      <ul className="grid gap-4 md:grid-cols-2" aria-busy={updating}>
        {notes.map((note) => (
          <li key={note.id}>
            <NoteCard note={note} />
          </li>
        ))}
      </ul>
    </>
  );
}
