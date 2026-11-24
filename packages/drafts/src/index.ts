import { type DBSchema, type IDBPDatabase, openDB } from "idb";

/**
 * Form drafts in IndexedDB: survive refreshes, crashes and closed tabs, stay on this device, and
 * never leave the browser. Strictly functional storage, so no consent is needed.
 */

export interface Draft<T> {
  value: T;
  savedAt: number;
}

interface DraftsDB extends DBSchema {
  drafts: { key: string; value: Draft<unknown> };
}

const DB_NAME = "getsetgo";
const DB_VERSION = 1;
/** Old drafts are forgotten after 30 days. */
export const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let dbPromise: Promise<IDBPDatabase<DraftsDB>> | undefined;

function db(): Promise<IDBPDatabase<DraftsDB>> {
  dbPromise ??= openDB<DraftsDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      // Versioned schema: future versions add stores or indexes here.
      database.createObjectStore("drafts");
    },
  });
  return dbPromise;
}

/** IndexedDB exists in browsers only (not during server rendering, not in some private modes). */
export const isDraftStorageAvailable = (): boolean => typeof indexedDB !== "undefined";

export async function saveDraft<T>(key: string, value: T, now = Date.now()): Promise<void> {
  if (!isDraftStorageAvailable()) return;
  await (await db()).put("drafts", { value, savedAt: now }, key);
}

export async function loadDraft<T>(key: string, now = Date.now()): Promise<Draft<T> | undefined> {
  if (!isDraftStorageAvailable()) return undefined;
  const draft = (await (await db()).get("drafts", key)) as Draft<T> | undefined;
  if (draft && now - draft.savedAt > DRAFT_TTL_MS) {
    await clearDraft(key);
    return undefined;
  }
  return draft;
}

export async function clearDraft(key: string): Promise<void> {
  if (!isDraftStorageAvailable()) return;
  await (await db()).delete("drafts", key);
}

/** Calls `fn` once input pauses for `waitMs` (so we don't write on every keystroke). */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, waitMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

/** The note forms' draft key and "is there anything worth keeping?" check. */
export const NOTE_DRAFT_KEY = "note-form";
export const isEmptyNoteDraft = (draft: { title?: string; content?: string }): boolean =>
  !draft.title?.trim() && !draft.content?.trim();

/** Test helper: forget the cached connection (fake-indexeddb resets between tests). */
export function resetDraftsConnectionForTests(): void {
  dbPromise = undefined;
}
