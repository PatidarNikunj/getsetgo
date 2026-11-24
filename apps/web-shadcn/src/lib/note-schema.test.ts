import { describe, expect, it } from "vitest";

import { noteFormSchema } from "./note-schema";

describe("noteFormSchema", () => {
  it("accepts a valid note and trims the title", () => {
    const result = noteFormSchema.parse({ title: "  Trip  ", content: "Lisbon" });
    expect(result.title).toBe("Trip");
  });

  it.each([
    [{ title: "   ", content: "x" }, "Enter a title."],
    [{ title: "t".repeat(201), content: "x" }, "Keep the title under 200 characters."],
    [{ title: "T", content: "   " }, "Write something in the note."],
    [{ title: "T", content: "x".repeat(20_001) }, "Keep the note under 20,000 characters."],
  ])("rejects %o", (input, message) => {
    const result = noteFormSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(message);
  });
});
