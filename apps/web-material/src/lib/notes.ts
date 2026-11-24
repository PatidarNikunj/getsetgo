import { NOTE_LIMITS, type NoteFieldsFragment, NotesListDocument } from "@getsetgo/graphql";
import * as yup from "yup";

export type Note = NoteFieldsFragment;

/** The one notes query both the server preload and the client hook use (they must match). */
export const notesListQuery = { query: NotesListDocument, variables: { page: { take: 50 } } };

/** Client-side validation for the note form; mirrors the API's rules (the API still validates). */
export const noteFormSchema = yup.object({
  title: yup
    .string()
    .trim()
    .required("Enter a title.")
    .max(NOTE_LIMITS.titleMax, `Keep the title under ${NOTE_LIMITS.titleMax} characters.`),
  content: yup
    .string()
    .test("not-blank", "Write something in the note.", (value) => !!value?.trim())
    .max(
      NOTE_LIMITS.contentMax,
      `Keep the note under ${NOTE_LIMITS.contentMax.toLocaleString("en")} characters.`,
    )
    .required("Write something in the note."),
});

export type NoteFormValues = yup.InferType<typeof noteFormSchema>;
