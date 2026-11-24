"use client";

import { describeError } from "@getsetgo/graphql";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/hooks/use-hydrated";
import { useNoteDraft } from "@/hooks/use-note-draft";
import { type NoteFormValues, noteFormSchema } from "@/lib/note-schema";
import { createNote, notesQuery } from "@/lib/notes";

const timeFormat = new Intl.DateTimeFormat("en", { timeStyle: "short" });

/** React Hook Form + Zod: validation runs in the browser first; the API validates again. */
export function NoteForm() {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();
  const form = useForm<NoteFormValues>({
    resolver: zodResolver(noteFormSchema),
    defaultValues: { title: "", content: "" },
  });
  const { errors } = form.formState;

  // setValue writes straight into the registered inputs; reset(values) only updated the form's
  // internal state here, leaving the visible fields unchanged.
  const fillForm = (values: NoteFormValues) => {
    form.setValue("title", values.title, { shouldDirty: true });
    form.setValue("content", values.content, { shouldDirty: true });
    form.clearErrors();
  };

  // Autosave to IndexedDB; restore after a refresh if the form is still empty.
  const draft = useNoteDraft({
    isFormEmpty: () => !form.getValues("title") && !form.getValues("content"),
    restore: (values) => fillForm(values),
  });
  const { save: saveDraft } = draft;
  useEffect(
    () =>
      // subscribe() (not watch()) so the React Compiler can still optimize this component.
      form.subscribe({
        formState: { values: true },
        callback: ({ values }) =>
          saveDraft({ title: values.title ?? "", content: values.content ?? "" }),
      }),
    [form, saveDraft],
  );

  const mutation = useMutation({
    mutationFn: createNote,
    onSuccess: async (note) => {
      form.reset();
      draft.clear();
      toast.success(`Saved “${note.title}”`);
      await queryClient.invalidateQueries({ queryKey: notesQuery.key });
    },
    onError: (error) => toast.error(describeError(error)),
  });

  return (
    <form
      noValidate
      aria-labelledby="new-note-heading"
      onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
    >
      <FieldGroup>
        {draft.restoredAt !== null && (
          <Alert role="status">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>Draft restored from {timeFormat.format(draft.restoredAt)}.</span>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => {
                  fillForm({ title: "", content: "" });
                  draft.clear();
                }}
              >
                Discard draft
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <Field data-invalid={!!errors.title}>
          <FieldLabel htmlFor="note-title">Title</FieldLabel>
          <Input
            id="note-title"
            autoComplete="off"
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? "note-title-error" : undefined}
            {...form.register("title")}
          />
          {errors.title && <FieldError id="note-title-error">{errors.title.message}</FieldError>}
        </Field>
        <Field data-invalid={!!errors.content}>
          <FieldLabel htmlFor="note-content">Note</FieldLabel>
          <Textarea
            id="note-content"
            rows={5}
            aria-invalid={!!errors.content}
            aria-describedby={errors.content ? "note-content-error" : undefined}
            {...form.register("content")}
          />
          {errors.content && (
            <FieldError id="note-content-error">{errors.content.message}</FieldError>
          )}
        </Field>
        <div>
          <Button type="submit" size="lg" disabled={!hydrated || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save note"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
