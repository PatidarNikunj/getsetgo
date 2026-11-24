import { describe, expect, it } from "vitest";

import { makeStore } from "./store";
import { notificationDismissed, notify, themeChanged } from "./ui-slice";

describe("ui slice (Redux Toolkit)", () => {
  it("tracks the theme preference", () => {
    const store = makeStore();
    store.dispatch(themeChanged("dark"));
    expect(store.getState().ui.theme).toBe("dark");
  });

  it("shows and dismisses notifications with unique ids", () => {
    const store = makeStore();
    store.dispatch(notify("Saved"));
    const first = store.getState().ui.notification;
    store.dispatch(notify("Oops", "error"));
    const second = store.getState().ui.notification;

    expect(first).toMatchObject({ message: "Saved", severity: "success" });
    expect(second).toMatchObject({ message: "Oops", severity: "error" });
    expect(second?.id).not.toBe(first?.id);

    store.dispatch(notificationDismissed());
    expect(store.getState().ui.notification).toBeNull();
  });
});
