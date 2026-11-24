"use client";

import { describeError } from "@getsetgo/graphql";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SparklesIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { deleteNote, type Note, notesQuery, summarizeNote } from "@/lib/notes";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

export function NoteCard({ note }: { note: Note }) {
  const queryClient = useQueryClient();
  const headingId = `note-${note.id}-title`;

  const summarize = useMutation({
    mutationFn: () => summarizeNote(note.id),
    onSuccess: (updated) => {
      // Put the fresh summary straight into the cache instead of refetching the whole list.
      queryClient.setQueryData<Note[]>(notesQuery.key, (notes) =>
        notes?.map((n) => (n.id === updated.id ? updated : n)),
      );
      toast.success("Summary ready");
    },
    onError: (error) => toast.error(describeError(error)),
  });

  const remove = useMutation({
    mutationFn: () => deleteNote(note.id),
    onSuccess: async () => {
      toast.success(`Deleted “${note.title}”`);
      await queryClient.invalidateQueries({ queryKey: notesQuery.key });
    },
    onError: (error) => toast.error(describeError(error)),
  });

  return (
    <Card aria-labelledby={headingId} className="h-full">
      <CardHeader>
        <CardTitle>
          <h3 id={headingId}>{note.title}</h3>
        </CardTitle>
        <CardDescription>
          <time dateTime={note.createdAt}>{dateFormat.format(new Date(note.createdAt))}</time>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="whitespace-pre-wrap break-words">{note.content}</p>
        {note.summary && (
          <section aria-label="AI summary" className="rounded-lg bg-muted p-3 text-sm">
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="secondary">AI summary</Badge>
              <span className="text-muted-foreground">{note.summary.model}</span>
            </div>
            <p>{note.summary.summary}</p>
            {note.summary.keyPoints.length > 0 && (
              <ul className="mt-2 list-disc pl-5">
                {note.summary.keyPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            )}
          </section>
        )}
      </CardContent>
      <CardFooter className="mt-auto gap-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => summarize.mutate()}
          disabled={summarize.isPending}
          aria-describedby={headingId}
        >
          <SparklesIcon aria-hidden="true" />
          {summarize.isPending ? "Summarizing…" : note.summary ? "Summarize again" : "Summarize"}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="destructive"
              size="lg"
              disabled={remove.isPending}
              aria-describedby={headingId}
            >
              <Trash2Icon aria-hidden="true" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{note.title}”?</AlertDialogTitle>
              <AlertDialogDescription>
                The note and its AI summary will be removed. This can’t be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => remove.mutate()}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}
