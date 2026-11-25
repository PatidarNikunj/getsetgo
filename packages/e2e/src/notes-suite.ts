import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/** Unique, readable titles so parallel tests never collide in the shared database. */
const uniqueTitle = (label: string) =>
  `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const titleField = (page: Page) => page.getByRole("textbox", { name: "Title" });
const contentField = (page: Page) => page.getByRole("textbox", { name: "Note", exact: true });
const noteItem = (page: Page, title: string): Locator =>
  page.locator("main li").filter({ has: page.getByRole("heading", { name: title, exact: true }) });

/**
 * "Save note" is disabled until React hydrates, so it doubles as an "app is interactive" signal.
 * Also wait for the streamed notes list to finish loading: saving a note before React has
 * hydrated that section makes it re-render on the client (docs/frontends.md, known limitation).
 */
const waitForHydration = async (page: Page) => {
  await expect(page.getByRole("button", { name: "Save note" })).toBeEnabled({ timeout: 30_000 });
  await page.waitForLoadState("networkidle");
};

async function createNote(page: Page, title: string, content = "Written by Playwright.") {
  await waitForHydration(page);
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
    test("renders notes on the server with security headers", async ({ page }) => {
      // page.request shares the browser's (signed-in) cookies.
      const response = await page.request.get("/");
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

    test("proxies GraphQL through its own origin", async ({ page }) => {
      const response = await page.request.post("/api/graphql", {
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
      // Before hydration a native submit would reload the page with the note in the URL.
      await expect(page.getByRole("button", { name: "Save note" })).toBeDisabled();
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

    test("autosaves a draft and restores it after a reload", async ({ page }) => {
      const title = uniqueTitle("E2E draft");
      await page.goto("/");
      await waitForHydration(page);
      await titleField(page).fill(title);
      await contentField(page).fill("Kept in IndexedDB on this device.");

      // Autosave is debounced; reload once IndexedDB has it.
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              new Promise<string>((resolve) => {
                const open = indexedDB.open("getsetgo");
                open.onsuccess = () => {
                  const get = open.result
                    .transaction("drafts")
                    .objectStore("drafts")
                    .get("note-form");
                  get.onsuccess = () => resolve(JSON.stringify(get.result?.value ?? null));
                };
                open.onerror = () => resolve("null");
              }),
          ),
        )
        .toContain(title);

      await page.reload();
      await expect(page.getByText(/Draft restored/)).toBeVisible();
      await expect(titleField(page)).toHaveValue(title);
      await expect(contentField(page)).toHaveValue("Kept in IndexedDB on this device.");

      await page.getByRole("button", { name: "Discard draft" }).click();
      await expect(titleField(page)).toHaveValue("");
      await expect(page.getByText(/Draft restored/)).toBeHidden();
      await page.reload();
      await waitForHydration(page);
      await expect(page.getByText(/Draft restored/)).toBeHidden();
      await expect(titleField(page)).toHaveValue("");
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

  test.describe(`${appName}: cookie consent`, () => {
    test.use({ consentCookie: null });

    test("asks first, and makes no third-party requests before a choice", async ({
      page,
      baseURL,
      expectAccessible,
    }) => {
      const thirdParty: string[] = [];
      page.on("request", (req) => {
        if (!req.url().startsWith(baseURL!) && !req.url().startsWith("data:")) {
          thirdParty.push(req.url());
        }
      });
      await page.goto("/");
      const banner = page.getByRole("region", { name: "Cookie preferences" });
      await expect(banner).toBeVisible();
      await waitForHydration(page);
      await expectAccessible(page);
      expect(thirdParty).toEqual([]);
    });

    test("remembers the choice and lets the visitor change it", async ({ page, context }) => {
      await page.goto("/");
      await waitForHydration(page);
      const banner = page.getByRole("region", { name: "Cookie preferences" });
      await page.getByRole("button", { name: "Accept analytics" }).click();
      await expect(banner).toBeHidden();

      const consent = (await context.cookies()).find((c) => c.name === "gsg_consent");
      expect(decodeURIComponent(consent?.value ?? "")).toMatch(/^1\.a1\./);
      expect(consent?.sameSite).toBe("Lax");

      // Rendered from the cookie on the server: no banner, not even briefly.
      const html = await (await page.request.get("/")).text();
      expect(html).not.toContain("Cookie preferences");

      await page.getByRole("button", { name: "Cookie settings" }).click();
      await expect(banner).toBeVisible();
      await page.getByRole("button", { name: "Reject analytics" }).click();
      await expect(banner).toBeHidden();
      await expect
        .poll(async () => (await context.cookies()).find((c) => c.name === "gsg_consent")?.value)
        .toMatch(/^1\.a0\./);
    });
  });

  test.describe(`${appName}: accessibility (WCAG 2.2 AA)`, () => {
    for (const scheme of ["light", "dark"] as const) {
      test(`has no axe violations in ${scheme} mode`, async ({ page, expectAccessible }) => {
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
        await page.goto("/");
        await expect(page.getByRole("heading", { name: "Your notes" })).toBeVisible();
        await waitForHydration(page);
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

      await waitForHydration(page);
      await page.getByRole("button", { name: "Dark" }).click();
      await expect(page.getByRole("button", { name: "Dark" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect.poll(background).not.toBe(light);
    });
  });
}
