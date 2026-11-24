import { NOTE_LIMITS } from "@getsetgo/graphql";
import { z } from "zod";

// Zod 4 can compile schemas with `new Function` for speed; our CSP forbids eval, so opt out.
z.config({ jitless: true });

/** Client-side validation for the note form; mirrors the API's rules (the API still validates). */
export const noteFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Enter a title.")
    .max(NOTE_LIMITS.titleMax, `Keep the title under ${NOTE_LIMITS.titleMax} characters.`),
  content: z
    .string()
    .refine((value) => value.trim().length > 0, "Write something in the note.")
    .refine(
      (value) => value.length <= NOTE_LIMITS.contentMax,
      `Keep the note under ${NOTE_LIMITS.contentMax.toLocaleString("en")} characters.`,
    ),
});

export type NoteFormValues = z.infer<typeof noteFormSchema>;
