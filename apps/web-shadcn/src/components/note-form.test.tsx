import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NoteForm } from "./note-form";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderForm() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <h1 id="new-note-heading">New note</h1>
      <NoteForm />
    </QueryClientProvider>,
  );
}

describe("NoteForm", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows accessible errors and doesn't call the API when fields are empty", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderForm();

    await userEvent.click(screen.getByRole("button", { name: "Save note" }));

    const title = screen.getByRole("textbox", { name: "Title" });
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAccessibleDescription("Enter a title.");
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveAccessibleDescription(
      "Write something in the note.",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the createNote mutation and clears the form", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        data: {
          createNote: {
            id: "1",
            title: "Trip",
            content: "Lisbon",
            createdAt: "2026-01-01T00:00:00Z",
            summary: null,
          },
        },
      }),
    );
    renderForm();

    await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "Trip");
    await userEvent.type(screen.getByRole("textbox", { name: "Note" }), "Lisbon");
    await userEvent.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/graphql");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      variables: { input: { title: "Trip", content: "Lisbon" } },
    });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(""));
  });
});
