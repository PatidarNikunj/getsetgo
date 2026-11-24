"use client";

import { describeError } from "@getsetgo/graphql";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { deleteAccount } from "@/lib/account";

/** Permanent deletion behind an accessible confirmation (role="alertdialog", focus trapped). */
export function DeleteAccountDialog() {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      queryClient.clear();
      // A full page load on purpose: drops every bit of client state from the old session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/sign-in?deleted=1");
    },
    onError: (error) => toast.error(describeError(error)),
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" size="lg" disabled={remove.isPending}>
          <Trash2Icon aria-hidden="true" />
          {remove.isPending ? "Deleting…" : "Delete account"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes your account, all of your notes and their AI summaries, and
            signs you out everywhere. It can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => remove.mutate()}>
            Delete permanently
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
