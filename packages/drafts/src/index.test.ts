import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearDraft,
  debounce,
  DRAFT_TTL_MS,
  isEmptyNoteDraft,
  loadDraft,
  resetDraftsConnectionForTests,
  saveDraft,
} from "./index";

describe("drafts (IndexedDB)", () => {
  afterEach(() => resetDraftsConnectionForTests());

  it("saves, loads and clears a draft", async () => {
    await saveDraft("form", { title: "Trip", content: "Lisbon" }, 1000);
    expect(await loadDraft("form", 2000)).toEqual({
      value: { title: "Trip", content: "Lisbon" },
      savedAt: 1000,
    });

    await clearDraft("form");
    expect(await loadDraft("form")).toBeUndefined();
  });

  it("forgets drafts older than the TTL", async () => {
    await saveDraft("old", { title: "x" }, 0);
    expect(await loadDraft("old", DRAFT_TTL_MS + 1)).toBeUndefined();
    expect(await loadDraft("old", 0)).toBeUndefined(); // deleted, not just hidden
  });
});

describe("debounce", () => {
  it("waits for a pause", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 500);
    debounced(1);
    debounced(2);
    vi.advanceTimersByTime(499);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledExactlyOnceWith(2);
    vi.useRealTimers();
  });
});

describe("isEmptyNoteDraft", () => {
  it("ignores whitespace-only drafts", () => {
    expect(isEmptyNoteDraft({ title: "  ", content: "\n" })).toBe(true);
    expect(isEmptyNoteDraft({ title: "a", content: "" })).toBe(false);
  });
});
