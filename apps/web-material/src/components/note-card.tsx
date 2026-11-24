"use client";

import { useMutation } from "@apollo/client/react";
import { DeleteNoteDocument, SummarizeNoteDocument } from "@getsetgo/graphql";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesomeOutlined";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import { useRef, useState } from "react";

import { describeApolloError } from "@/lib/errors";
import type { Note } from "@/lib/notes";
import { useAppDispatch } from "@/store/store";
import { notify } from "@/store/ui-slice";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

export function NoteCard({ note }: { note: Note }) {
  const dispatch = useAppDispatch();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const headingId = `note-${note.id}-title`;

  // The returned Note has the same id, so Apollo's normalized cache updates the card by itself.
  const [summarize, { loading: summarizing }] = useMutation(SummarizeNoteDocument, {
    variables: { id: note.id },
    onCompleted: () => dispatch(notify("Summary ready")),
    onError: (error) => dispatch(notify(describeApolloError(error), "error")),
  });

  const [remove, { loading: removing }] = useMutation(DeleteNoteDocument, {
    variables: { id: note.id },
    // Drop the note from the cache; every list that referenced it updates.
    update(cache) {
      cache.evict({ id: cache.identify({ __typename: "Note", id: note.id }) });
      cache.gc();
    },
    onCompleted: () => dispatch(notify(`Deleted “${note.title}”`)),
    onError: (error) => dispatch(notify(describeApolloError(error), "error")),
  });

  return (
    <Card
      component="article"
      aria-labelledby={headingId}
      variant="outlined"
      sx={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div>
          <Typography variant="h6" component="h3" id={headingId}>
            {note.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <time dateTime={note.createdAt}>{dateFormat.format(new Date(note.createdAt))}</time>
          </Typography>
        </div>
        <Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {note.content}
        </Typography>
        {note.summary && (
          <Box
            component="section"
            aria-label="AI summary"
            sx={{ bgcolor: "action.hover", borderRadius: 1, p: 1.5 }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
              <Chip label="AI summary" size="small" />
              <Typography variant="body2" color="text.secondary">
                {note.summary.model}
              </Typography>
            </Box>
            <Typography variant="body2">{note.summary.summary}</Typography>
            {note.summary.keyPoints.length > 0 && (
              <Box component="ul" sx={{ mt: 1, mb: 0, pl: 3 }}>
                {note.summary.keyPoints.map((point) => (
                  <Typography component="li" variant="body2" key={point}>
                    {point}
                  </Typography>
                ))}
              </Box>
            )}
          </Box>
        )}
      </CardContent>
      <CardActions sx={{ mt: "auto", px: 2, pb: 2 }}>
        <Button
          variant="outlined"
          startIcon={<AutoAwesomeIcon aria-hidden="true" />}
          onClick={() => void summarize()}
          disabled={summarizing}
          aria-describedby={headingId}
        >
          {summarizing ? "Summarizing…" : note.summary ? "Summarize again" : "Summarize"}
        </Button>
        <Button
          color="error"
          startIcon={<DeleteIcon aria-hidden="true" />}
          onClick={() => setConfirmOpen(true)}
          disabled={removing}
          aria-describedby={headingId}
        >
          Delete
        </Button>
      </CardActions>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        role="alertdialog"
        // ARIA alertdialog pattern: start on the least destructive action.
        slotProps={{ transition: { onEntered: () => cancelRef.current?.focus() } }}
        aria-labelledby={`${headingId}-dialog-title`}
        aria-describedby={`${headingId}-dialog-description`}
      >
        <DialogTitle id={`${headingId}-dialog-title`}>Delete “{note.title}”?</DialogTitle>
        <DialogContent>
          <DialogContentText id={`${headingId}-dialog-description`}>
            The note and its AI summary will be removed. This can’t be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button ref={cancelRef} onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setConfirmOpen(false);
              void remove();
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
