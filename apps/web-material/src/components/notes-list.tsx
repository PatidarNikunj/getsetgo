"use client";

import { useSuspenseQuery } from "@apollo/client/react";
import Typography from "@mui/material/Typography";

import { notesListQuery } from "@/lib/notes";

import { NoteCard } from "./note-card";

/** Reads the notes the server preloaded into Apollo's cache, then keeps them up to date. */
export function NotesList() {
  const { data } = useSuspenseQuery(notesListQuery.query, {
    variables: notesListQuery.variables,
  });
  const notes = data.notesList;

  if (notes.length === 0) {
    return (
      <Typography color="text.secondary">No notes yet. Write your first one above.</Typography>
    );
  }

  return (
    <>
      <Typography className="visually-hidden" aria-live="polite">
        {`${notes.length} notes`}
      </Typography>
      <ul className="notes-grid">
        {notes.map((note) => (
          <li key={note.id}>
            <NoteCard note={note} />
          </li>
        ))}
      </ul>
    </>
  );
}
