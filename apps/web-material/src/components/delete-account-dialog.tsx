"use client";

import { useMutation } from "@apollo/client/react";
import { DeleteAccountDocument } from "@getsetgo/graphql";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { useId, useRef, useState } from "react";

import { describeApolloError } from "@/lib/errors";
import { useAppDispatch } from "@/store/store";
import { notify } from "@/store/ui-slice";

/** Permanent deletion behind an accessible confirmation (role="alertdialog", focus trapped). */
export function DeleteAccountDialog() {
  const [open, setOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const dispatch = useAppDispatch();
  const [deleteAccount, { loading, client }] = useMutation(DeleteAccountDocument, {
    onCompleted: async () => {
      await client.clearStore();
      // A full page load on purpose: drops every bit of client state from the old session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/sign-in?deleted=1");
    },
    onError: (error) => dispatch(notify(describeApolloError(error), "error")),
  });

  return (
    <>
      <Button color="error" variant="outlined" disabled={loading} onClick={() => setOpen(true)}>
        {loading ? "Deleting…" : "Delete account"}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        role="alertdialog"
        // ARIA alertdialog pattern: start on the least destructive action.
        slotProps={{ transition: { onEntered: () => cancelRef.current?.focus() } }}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
      >
        <DialogTitle id={`${id}-title`}>Delete your account?</DialogTitle>
        <DialogContent>
          <DialogContentText id={`${id}-description`}>
            This permanently deletes your account, all of your notes and their AI summaries, and
            signs you out everywhere. It can&apos;t be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button ref={cancelRef} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setOpen(false);
              void deleteAccount();
            }}
          >
            Delete permanently
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
