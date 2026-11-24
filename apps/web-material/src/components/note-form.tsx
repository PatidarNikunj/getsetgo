"use client";

import { useMutation } from "@apollo/client/react";
import { CreateNoteDocument } from "@getsetgo/graphql";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useFormik } from "formik";

import { describeApolloError } from "@/lib/errors";
import { type NoteFormValues, noteFormSchema, notesListQuery } from "@/lib/notes";
import { useAppDispatch } from "@/store/store";
import { notify } from "@/store/ui-slice";

/** Formik + Yup: validation runs in the browser first; the API validates again. */
export function NoteForm() {
  const dispatch = useAppDispatch();
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
        dispatch(notify(`Saved “${data?.createNote.title ?? values.title}”`));
      } catch (error) {
        dispatch(notify(describeApolloError(error), "error"));
      }
    },
  });

  const error = (field: keyof NoteFormValues) =>
    formik.submitCount > 0 && formik.errors[field] ? formik.errors[field] : undefined;

  return (
    <form noValidate aria-labelledby="new-note-heading" onSubmit={formik.handleSubmit}>
      <Stack spacing={2}>
        <TextField
          id="note-title"
          label="Title"
          autoComplete="off"
          {...formik.getFieldProps("title")}
          error={!!error("title")}
          helperText={error("title")}
        />
        <TextField
          id="note-content"
          label="Note"
          multiline
          minRows={5}
          {...formik.getFieldProps("content")}
          error={!!error("content")}
          helperText={error("content")}
        />
        <div>
          <Button type="submit" variant="contained" size="large" disabled={loading}>
            {loading ? "Saving…" : "Save note"}
          </Button>
        </div>
      </Stack>
    </form>
  );
}
