import {
  CreateNoteDocument,
  type CreateNoteMutationVariables,
  DeleteNoteDocument,
  GRAPHQL_PATH,
  type NoteFieldsFragment,
  NotesListDocument,
  requestGraphQL,
  SummarizeNoteDocument,
  withSessionRetry,
} from "@getsetgo/graphql";
import { queryOptions } from "@tanstack/react-query";

export type Note = NoteFieldsFragment;

/**
 * One place for the notes query key and options, so the server prefetch and the client hook
 * always agree (otherwise hydration would miss and refetch).
 */
export const notesQuery = {
  key: ["notes", "list"] as const,
  options: () =>
    queryOptions({
      queryKey: notesQuery.key,
      queryFn: async (): Promise<Note[]> =>
        (
          await withSessionRetry(() =>
            requestGraphQL(GRAPHQL_PATH, NotesListDocument, { page: { take: 50 } }),
          )
        ).notesList,
      // Hydrated server data counts as fresh for 30 s, so the browser doesn't refetch right away.
      staleTime: 30_000,
    }),
};

// Every call renews an expired session once and retries (see withSessionRetry).
export const createNote = (input: CreateNoteMutationVariables["input"]) =>
  withSessionRetry(() => requestGraphQL(GRAPHQL_PATH, CreateNoteDocument, { input })).then(
    (d) => d.createNote,
  );

export const deleteNote = (id: string) =>
  withSessionRetry(() => requestGraphQL(GRAPHQL_PATH, DeleteNoteDocument, { id })).then(
    (d) => d.deleteNote,
  );

export const summarizeNote = (id: string) =>
  withSessionRetry(() => requestGraphQL(GRAPHQL_PATH, SummarizeNoteDocument, { id })).then(
    (d) => d.summarizeNote,
  );
