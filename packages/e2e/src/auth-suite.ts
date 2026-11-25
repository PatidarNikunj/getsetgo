import type { Browser, Page } from "@playwright/test";

import { signIn, uniqueLogin } from "./auth";
import { expect, test } from "./fixtures";

const ACCESS_COOKIE = "__Host-gsg_at";
const REFRESH_COOKIE = "__Host-gsg_rt";

const accountMenu = (page: Page) => page.getByRole("button", { name: "Account menu" });
/** The page's own alert (Next.js also has an empty role="alert" route announcer). */
const pageAlert = (page: Page) => page.getByRole("main").getByRole("alert");
/** Buttons are disabled until React hydrates; wait (and for the streamed list) before typing. */
const waitForHydration = async (page: Page) => {
  await expect(page.getByRole("button", { name: "Save note" })).toBeEnabled({ timeout: 30_000 });
  await page.waitForLoadState("networkidle");
};

async function openMenuItem(page: Page, name: string) {
  const item = page.getByRole("menuitem", { name, exact: true });
  // The menu only opens once React has hydrated the button; retry the click until it does.
  await expect(async () => {
    if (!(await item.isVisible())) await accountMenu(page).click();
    await expect(item).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await item.click();
}

async function newSignedOutPage(browser: Browser, baseURL: string): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  await context.addCookies([
    {
      name: "gsg_consent",
      value: encodeURIComponent("1.a0.2026-01-01T00:00:00.000Z"),
      url: baseURL,
    },
  ]);
  return context.newPage();
}

/**
 * Sign-in, sessions and account deletion (specs/001-oauth-login) for both web apps, through the
 * test provider. Same accessible names in both apps (contracts/graphql.md).
 */
export function authSuite(appName: string) {
  test.describe(`${appName}: sign in (US1)`, () => {
    test.use({ signedIn: false });

    test("signed-out visitors see the sign-in page, not notes", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/sign-in$/);
      await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Continue with test provider" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Your notes" })).toHaveCount(0);

      // Deep links come back after signing in.
      await page.goto("/account");
      await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Faccount$/);
    });

    test("the GraphQL API refuses signed-out requests", async ({ page }) => {
      const res = await page.request.post("/api/graphql", {
        data: { query: "{ notesList { id } }" },
      });
      const body = (await res.json()) as { errors: { extensions: { code: string } }[] };
      expect(body.errors[0]?.extensions.code).toBe("UNAUTHENTICATED");
    });

    test("signs in, lands on an empty notes page and shows the account in the header", async ({
      page,
      context,
    }) => {
      const login = await signIn(page);
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("heading", { name: "Your notes" })).toBeVisible();
      await expect(page.getByText("No notes yet").first()).toBeVisible();
      await expect(accountMenu(page)).toContainText(login);
      await expect(accountMenu(page)).toContainText("via Test");

      // Session cookies: httpOnly (no script access), Secure, SameSite=Lax.
      const cookies = await context.cookies();
      for (const name of [ACCESS_COOKIE, REFRESH_COOKIE]) {
        const cookie = cookies.find((c) => c.name === name);
        expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/" });
      }
      const visibleToScripts = await page.evaluate(() => document.cookie);
      expect(visibleToScripts).not.toContain("gsg_at");
      expect(visibleToScripts).not.toContain("gsg_rt");
    });

    test("returns to the page the visitor asked for", async ({ page }) => {
      await page.goto("/account");
      await signIn(page, uniqueLogin(), { from: page.url() });
      await expect(page).toHaveURL(/\/account$/);
      await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
    });

    test("users only ever see their own notes", async ({ page, browser, baseURL }) => {
      await signIn(page);
      await waitForHydration(page);
      const title = `Private ${Date.now().toString(36)}`;
      await page.getByRole("textbox", { name: "Title" }).fill(title);
      await page.getByRole("textbox", { name: "Note", exact: true }).fill("Only mine.");
      await page.getByRole("button", { name: "Save note" }).click();
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();

      const other = await newSignedOutPage(browser, baseURL!);
      await signIn(other);
      await expect(other.getByRole("heading", { name: "Your notes" })).toBeVisible();
      // .first(): while streaming, React can briefly have the server and client copies.
      await expect(
        other.getByRole("region", { name: "Your notes" }).getByText("No notes yet").first(),
      ).toBeVisible();
      await expect(other.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
      await other.context().close();
    });

    test("explains that the app is invite-only", async ({ page }) => {
      await signIn(page, "intruder", { expectLanding: false });
      await expect(page).toHaveURL(/\/sign-in\?error=invite_only$/);
      await expect(pageAlert(page)).toContainText("invite-only");
    });

    test("explains a cancelled sign-in and allows trying again", async ({ page }) => {
      await page.goto("/sign-in");
      await page.getByRole("button", { name: "Continue with test provider" }).click();
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(pageAlert(page)).toContainText("cancelled");
      await expect(page.getByRole("button", { name: "Continue with test provider" })).toBeEnabled();
    });

    for (const scheme of ["light", "dark"] as const) {
      test(`the sign-in page has no axe violations in ${scheme} mode`, async ({
        page,
        expectAccessible,
      }) => {
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
        await page.goto("/sign-in?error=invite_only");
        await expect(pageAlert(page)).toBeVisible();
        await expectAccessible(page);
      });
    }
  });

  test.describe(`${appName}: sessions (US2)`, () => {
    test("stays signed in when the short-lived cookie is gone (renewal)", async ({
      page,
      context,
    }) => {
      await context.clearCookies({ name: ACCESS_COOKIE });
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Your notes" })).toBeVisible();
      const cookies = await context.cookies();
      expect(cookies.find((c) => c.name === ACCESS_COOKIE)).toBeDefined();
    });

    test("signs out; Back doesn't show the notes", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Your notes" })).toBeVisible();
      await openMenuItem(page, "Sign out");
      await expect(page).toHaveURL(/\/sign-in\?signedOut=1$/);
      await expect(page.getByRole("status").filter({ hasText: "signed out" })).toBeVisible();

      await page.goBack();
      await expect(page.getByRole("heading", { name: "Your notes" })).toHaveCount(0);
      await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    });

    test("signs out everywhere", async ({ page, login, browser, baseURL }) => {
      const other = await newSignedOutPage(browser, baseURL!);
      await signIn(other, login);

      await page.goto("/");
      await openMenuItem(page, "Sign out everywhere");
      await expect(page).toHaveURL(/\/sign-in\?signedOut=1$/);

      // The other browser keeps its 15-minute cookie, but can't renew it.
      await other.context().clearCookies({ name: ACCESS_COOKIE });
      await other.goto("/");
      await expect(other).toHaveURL(/\/sign-in/);
      await other.context().close();
    });

    test("the open account menu has no axe violations", async ({ page, expectAccessible }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/");
      await waitForHydration(page);
      await expectAccessible(page);
      const item = page.getByRole("menuitem", { name: "Sign out everywhere" });
      await expect(async () => {
        if (!(await item.isVisible())) await accountMenu(page).click();
        await expect(item).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 15_000 });
      await expectAccessible(page, '[role="menu"]');
    });
  });

  test.describe(`${appName}: account (US3)`, () => {
    test("shows the account and deletes it after confirming", async ({ page, login }) => {
      await page.goto("/");
      await waitForHydration(page);
      await page.getByRole("textbox", { name: "Title" }).fill("Soon gone");
      await page
        .getByRole("textbox", { name: "Note", exact: true })
        .fill("Deleted with the account.");
      await page.getByRole("button", { name: "Save note" }).click();
      await expect(page.getByRole("heading", { name: "Soon gone", exact: true })).toBeVisible();

      await openMenuItem(page, "Account");
      await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
      await expect(page.getByText(login, { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Test", { exact: true })).toBeVisible();

      // Cancel keeps everything; focus starts on the safe action.
      await page.getByRole("button", { name: "Delete account" }).click();
      const dialog = page.getByRole("alertdialog", { name: "Delete your account?" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByRole("button", { name: "Delete account" })).toBeFocused();

      await page.getByRole("button", { name: "Delete account" }).click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Delete permanently" })
        .click();
      await expect(page).toHaveURL(/\/sign-in\?deleted=1$/);
      await expect(
        page.getByRole("status").filter({ hasText: "permanently deleted" }),
      ).toBeVisible();

      // Same person again: a brand-new, empty account.
      await signIn(page, login);
      await expect(page.getByText("No notes yet").first()).toBeVisible();
    });

    for (const scheme of ["light", "dark"] as const) {
      test(`the account page and dialog have no axe violations in ${scheme} mode`, async ({
        page,
        expectAccessible,
      }) => {
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
        await page.goto("/account");
        await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
        await expectAccessible(page);
        await page.getByRole("button", { name: "Delete account" }).click();
        await expect(page.getByRole("alertdialog")).toBeVisible();
        await expectAccessible(page, '[role="alertdialog"]');
      });
    }
  });
}
