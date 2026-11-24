import { MockedProvider } from "@apollo/client/testing/react";
import { CreateNoteDocument } from "@getsetgo/graphql";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";

import { notesListQuery } from "@/lib/notes";
import { makeStore } from "@/store/store";

import { NoteForm } from "./note-form";

const created = {
  __typename: "Note",
  id: "1",
  title: "Trip",
  content: "Lisbon",
  createdAt: "2026-01-01T00:00:00Z",
  summary: null,
};

function renderForm(mocks: React.ComponentProps<typeof MockedProvider>["mocks"] = []) {
  const store = makeStore();
  render(
    <Provider store={store}>
      <MockedProvider mocks={mocks}>
        <>
          <h1 id="new-note-heading">New note</h1>
          <NoteForm />
        </>
      </MockedProvider>
    </Provider>,
  );
  return store;
}

describe("NoteForm (Formik + Yup + Apollo)", () => {
  it("shows accessible errors when fields are empty", async () => {
    renderForm();

    await userEvent.click(screen.getByRole("button", { name: "Save note" }));

    const title = await screen.findByRole("textbox", { name: "Title" });
    await waitFor(() => expect(title).toHaveAttribute("aria-invalid", "true"));
    expect(title).toHaveAccessibleDescription("Enter a title.");
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveAccessibleDescription(
      "Write something in the note.",
    );
  });

  it("runs the createNote mutation, refreshes the list and notifies", async () => {
    const store = renderForm([
      {
        request: {
          query: CreateNoteDocument,
          variables: { input: { title: "Trip", content: "Lisbon" } },
        },
        result: { data: { createNote: created } },
      },
      {
        request: notesListQuery,
        result: { data: { notesList: [created] } },
      },
    ]);

    await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "  Trip ");
    await userEvent.type(screen.getByRole("textbox", { name: "Note" }), "Lisbon");
    await userEvent.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() =>
      expect(store.getState().ui.notification).toMatchObject({ message: "Saved “Trip”" }),
    );
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("");
  });
});
