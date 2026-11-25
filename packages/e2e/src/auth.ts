import { expect, type Page } from "@playwright/test";

/** Logins allowed by the e2e allowlist (AUTH_ALLOWLIST=test:e2e-*). */
export const uniqueLogin = (label = "user"): string =>
  `e2e-${label}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Signs in like a person would: the sign-in page, the test provider's consent form, back to the
 * app. Exercises the real OAuth flow (state, PKCE, callback, cookies) on every call.
 */
export async function signIn(
  page: Page,
  login: string = uniqueLogin(),
  { from = "/sign-in", expectLanding = true }: { from?: string; expectLanding?: boolean } = {},
): Promise<string> {
  await page.goto(from);
  await page.getByRole("button", { name: "Continue with test provider" }).click();
  await page.getByRole("textbox", { name: "Test identity" }).fill(login);
  await page.getByRole("button", { name: "Continue" }).click();
  if (expectLanding) {
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
    await page.waitForLoadState("load");
  }
  return login;
}
