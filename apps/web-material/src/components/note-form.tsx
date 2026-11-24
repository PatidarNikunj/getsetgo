"use client";

import { useMutation } from "@apollo/client/react";
import { CreateNoteDocument } from "@getsetgo/graphql";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useFormik } from "formik";
import { useEffect, useRef } from "react";

import { useHydrated } from "@/hooks/use-hydrated";
import { useNoteDraft } from "@/hooks/use-note-draft";
import { describeApolloError } from "@/lib/errors";
import { type NoteFormValues, noteFormSchema, notesListQuery } from "@/lib/notes";
import { useAppDispatch } from "@/store/store";
import { notify } from "@/store/ui-slice";

const timeFormat = new Intl.DateTimeFormat("en", { timeStyle: "short" });

/** Formik + Yup: validation runs in the browser first; the API validates again. */
export function NoteForm() {
  const dispatch = useAppDispatch();
  const hydrated = useHydrated();
  const [createNote, { loading }] = useMutation(CreateNoteDocument, {
    // Refresh the list after saving so the new note shows up in the right place.
    refetchQueries: [notesListQuery],
    awaitRefetchQueries: true,
  });

  const formik = useFormik<NoteFormValues>({
    initialValues: { title: "", content: "" },
    validationSchema: noteFormSchema,
    validateOnBlur: false,
    onSubmit: async (values, { resetForm }) => {
      try {
        const { data } = await createNote({ variables: { input: noteFormSchema.cast(values) } });
        resetForm();
        draft.clear();
        dispatch(notify(`Saved “${data?.createNote.title ?? values.title}”`));
      } catch (error) {
        dispatch(notify(describeApolloError(error), "error"));
      }
    },
  });

  // Formik inputs are controlled: anything typed before React hydrates the page would be wiped
  // by the first re-render. On mount, adopt what's already in the fields so no input is lost.
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const { setValues } = formik;
  useEffect(() => {
    const title = titleRef.current?.value ?? "";
    const content = contentRef.current?.value ?? "";
    if (title || content) void setValues({ title, content }, false);
  }, [setValues]);

  // Autosave to IndexedDB; restore after a refresh if the form is still empty (checked on the
  // DOM fields, which also reflect anything typed before hydration).
  const draft = useNoteDraft({
    isFormEmpty: () => !titleRef.current?.value && !contentRef.current?.value,
    restore: (values) => void setValues(values, false),
  });
  const { ready: draftReady, save: saveDraft } = draft;
  useEffect(() => {
    if (draftReady) saveDraft(formik.values);
  }, [draftReady, saveDraft, formik.values]);

  const error = (field: keyof NoteFormValues) =>
    formik.submitCount > 0 && formik.errors[field] ? formik.errors[field] : undefined;

  return (
    <form noValidate aria-labelledby="new-note-heading" onSubmit={formik.handleSubmit}>
      <Stack spacing={2}>
        {draft.restoredAt !== null && (
          <Alert
            severity="info"
            role="status"
            action={
              <Button
                color="inherit"
                onClick={() => {
                  formik.resetForm();
                  draft.clear();
                }}
              >
                Discard draft
              </Button>
            }
          >
            Draft restored from {timeFormat.format(draft.restoredAt)}.
          </Alert>
        )}
        <TextField
          id="note-title"
          label="Title"
          autoComplete="off"
          inputRef={titleRef}
          {...formik.getFieldProps("title")}
          error={!!error("title")}
          helperText={error("title")}
        />
        <TextField
          id="note-content"
          label="Note"
          multiline
          minRows={5}
          inputRef={contentRef}
          {...formik.getFieldProps("content")}
          error={!!error("content")}
          helperText={error("content")}
        />
        <div>
          <Button type="submit" variant="contained" size="large" disabled={!hydrated || loading}>
            {loading ? "Saving…" : "Save note"}
          </Button>
        </div>
      </Stack>
    </form>
  );
}
