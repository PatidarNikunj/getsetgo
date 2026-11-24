import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/** Unique, readable titles so parallel tests never collide in the shared database. */
const uniqueTitle = (label: string) =>
  `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const titleField = (page: Page) => page.getByRole("textbox", { name: "Title" });
const contentField = (page: Page) => page.getByRole("textbox", { name: "Note", exact: true });
const noteItem = (page: Page, title: string): Locator =>
  page.locator("main li").filter({ has: page.getByRole("heading", { name: title, exact: true }) });

async function createNote(page: Page, title: string, content = "Written by Playwright.") {
  await titleField(page).fill(title);
  await contentField(page).fill(content);
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
}

/**
 * The same user journeys and accessibility checks for both web apps. They share accessible names
 * on purpose, so one suite proves both stacks behave the same.
 */
export function notesSuite(appName: string) {
  test.describe(`${appName}: notes`, () => {
    test("renders notes on the server with security headers", async ({ page, request }) => {
      const response = await request.get("/");
      const csp = response.headers()["content-security-policy"] ?? "";
      expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
      expect(csp).toContain("frame-ancestors 'none'");
      expect(response.headers()["x-content-type-options"]).toBe("nosniff");
      expect(response.headers()["x-frame-options"]).toBe("DENY");
      // Server-side rendering: the notes section is in the HTML before any JavaScript runs.
      expect(await response.text()).toContain("Your notes");

      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1, name: "New note" })).toBeVisible();
    });

    test("proxies GraphQL through its own origin", async ({ request }) => {
      const response = await request.post("/api/graphql", {
        data: { query: "{ notesList(page: { take: 1 }) { id } }" },
      });
      expect(response.ok()).toBe(true);
      expect((await response.json()) as object).toHaveProperty("data.notesList");
    });

    test("validates the form accessibly", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "Save note" }).click();

      await expect(titleField(page)).toHaveAttribute("aria-invalid", "true");
      await expect(titleField(page)).toHaveAccessibleDescription("Enter a title.");
      await expect(contentField(page)).toHaveAccessibleDescription("Write something in the note.");
    });

    test("creates a note and deletes it after confirming", async ({ page }) => {
      const title = uniqueTitle("E2E create");
      await page.goto("/");
      await createNote(page, title);
      await expect(titleField(page)).toHaveValue("");

      const item = noteItem(page, title);
      // Cancel first: the note must survive, and focus starts on the safe action.
      await item.getByRole("button", { name: "Delete" }).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(item).toBeVisible();

      await item.getByRole("button", { name: "Delete" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
      await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0);

      // Still gone after a full reload (it was deleted on the server, not just hidden).
      await page.reload();
      await expect(page.getByRole("heading", { name: "Your notes" })).toBeVisible();
      await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
    });

    test("summarizes a note, or explains that AI is unavailable", async ({ page }) => {
      const title = uniqueTitle("E2E summarize");
      await page.goto("/");
      await createNote(page, title, "Buy milk, eggs and bread. Call the plumber on Tuesday.");

      await noteItem(page, title).getByRole("button", { name: "Summarize" }).click();
      // Depends on whether ANTHROPIC_API_KEY is configured for apps/ai.
      await expect(
        page.getByText(/Summary ready|AI summaries are unavailable right now\./).first(),
      ).toBeVisible({ timeout: 60_000 });

      await noteItem(page, title).getByRole("button", { name: "Delete" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    });

    test("keeps text typed before the page finished loading", async ({ page }) => {
      // Hold back the JavaScript (not the CSS) so we type into the server-rendered form before
      // hydration, like on a slow connection.
      let releaseScripts!: () => void;
      const scriptsReleased = new Promise<void>((resolve) => (releaseScripts = resolve));
      await page.route("**/_next/static/chunks/**/*.js", async (route) => {
        await scriptsReleased;
        await route.continue();
      });

      const title = uniqueTitle("E2E early typing");
      // "commit": don't wait for DOMContentLoaded, which itself waits for the held-back scripts.
      await page.goto("/", { waitUntil: "commit" });
      await expect(titleField(page)).toBeVisible();
      await titleField(page).fill(title);
      releaseScripts();

      // After hydration the typed title must still be there and submit as normal.
      await page.waitForLoadState("networkidle");
      await contentField(page).fill("Typed while the page was still loading.");
      await expect(titleField(page)).toHaveValue(title);
      await page.getByRole("button", { name: "Save note" }).click();
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();

      await noteItem(page, title).getByRole("button", { name: "Delete" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    });

    test("offers a skip link for keyboard users", async ({ page }) => {
      await page.goto("/");
      await page.keyboard.press("Tab");
      const skip = page.getByRole("link", { name: "Skip to content" });
      await expect(skip).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/#main$/);
    });
  });

  test.describe(`${appName}: accessibility (WCAG 2.2 AA)`, () => {
    for (const scheme of ["light", "dark"] as const) {
      test(`has no axe violations in ${scheme} mode`, async ({ page, expectAccessible }) => {
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
        await page.goto("/");
        await expect(page.getByRole("heading", { name: "Your notes" })).toBeVisible();
        await expectAccessible(page);

        // Also check the error state of the form.
        await page.getByRole("button", { name: "Save note" }).click();
        await expect(titleField(page)).toHaveAttribute("aria-invalid", "true");
        await expectAccessible(page);
      });
    }

    test("the theme switch is a labelled toggle and changes the colors", async ({ page }) => {
      await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
      await page.goto("/");
      const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const light = await background();

      await page.getByRole("button", { name: "Dark" }).click();
      await expect(page.getByRole("button", { name: "Dark" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect.poll(background).not.toBe(light);
    });
  });
}
