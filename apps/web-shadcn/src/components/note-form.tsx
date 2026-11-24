"use client";

import { describeError } from "@getsetgo/graphql";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/hooks/use-hydrated";
import { type NoteFormValues, noteFormSchema } from "@/lib/note-schema";
import { createNote, notesQuery } from "@/lib/notes";

/** React Hook Form + Zod: validation runs in the browser first; the API validates again. */
export function NoteForm() {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();
  const form = useForm<NoteFormValues>({
    resolver: zodResolver(noteFormSchema),
    defaultValues: { title: "", content: "" },
  });
  const { errors } = form.formState;

  const mutation = useMutation({
    mutationFn: createNote,
    onSuccess: async (note) => {
      form.reset();
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
