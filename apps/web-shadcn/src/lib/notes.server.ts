import "server-only";

import { NotesListDocument, requestGraphQL } from "@getsetgo/graphql";

import type { Note } from "./notes";

const apiUrl = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");

/** Server-side fetch straight to the API (no browser, so no need for the /api/graphql proxy). */
export async function fetchNotesOnServer(): Promise<Note[]> {
  const data = await requestGraphQL(`${apiUrl}/graphql`, NotesListDocument, { page: { take: 50 } });
  return data.notesList;
}
