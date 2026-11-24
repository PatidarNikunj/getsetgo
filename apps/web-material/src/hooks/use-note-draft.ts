"use client";

import {
  clearDraft,
  debounce,
  isEmptyNoteDraft,
  loadDraft,
  NOTE_DRAFT_KEY,
  saveDraft,
} from "@getsetgo/drafts";
import { useEffect, useMemo, useState } from "react";

export interface NoteDraft {
  title: string;
  content: string;
}

/**
 * Autosaves the note form to IndexedDB and restores it after a refresh or crash.
 * - `restore(draft)` is called once on mount if a draft exists and the form is still empty.
 * - `save(values)` is debounced; empty forms delete the draft.
 * - `clear()` removes it (after a successful save, or "Discard draft").
 * - `ready` turns true once the saved draft has been checked; don't save before that, or an
 *   empty form on mount could delete the draft before it's restored.
 */
export function useNoteDraft({
  isFormEmpty,
  restore,
}: {
  isFormEmpty: () => boolean;
  restore: (draft: NoteDraft) => void;
}) {
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadDraft<NoteDraft>(NOTE_DRAFT_KEY)
      .then((draft) => {
        if (cancelled || !draft || isEmptyNoteDraft(draft.value) || !isFormEmpty()) return;
        restore(draft.value);
        setRestoredAt(draft.savedAt);
      })
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useMemo(
    () =>
      debounce((values: NoteDraft) => {
        void (isEmptyNoteDraft(values)
          ? clearDraft(NOTE_DRAFT_KEY)
          : saveDraft(NOTE_DRAFT_KEY, values));
      }, 400),
    [],
  );
  useEffect(() => () => save.cancel(), [save]);

  const clear = () => {
    save.cancel();
    setRestoredAt(null);
    void clearDraft(NOTE_DRAFT_KEY);
  };

  return { ready, restoredAt, save, clear };
}
