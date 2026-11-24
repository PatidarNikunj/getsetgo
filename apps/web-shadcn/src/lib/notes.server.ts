import "server-only";

import { NotesListDocument } from "@getsetgo/graphql";

import type { Note } from "./notes";
import { serverGraphQL } from "./session.server";

/** Server-side fetch straight to the API, forwarding only the session cookies. */
export async function fetchNotesOnServer(): Promise<Note[]> {
  const data = await serverGraphQL(NotesListDocument, { page: { take: 50 } });
  return data.notesList;
}
