import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test as base } from "@playwright/test";

import { signIn, uniqueLogin } from "./auth";

/** WCAG 2.2 A + AA rules (the constitution's target). */
export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Consent cookie value meaning "decided, analytics rejected" (see @getsetgo/consent). */
export const REJECTED_CONSENT = encodeURIComponent("1.a0.2026-01-01T00:00:00.000Z");

interface Options {
  /**
   * Consent cookie set before each test. Defaults to "analytics rejected", so the consent
   * banner doesn't cover the page; consent tests use `test.use({ consentCookie: null })`.
   */
  consentCookie: string | null;
  /**
   * Sign in (through the test provider) before the test, as a fresh user. Defaults to true:
   * notes are private, so most tests need a user. Auth tests use `test.use({ signedIn: false })`.
   */
  signedIn: boolean;
}

interface Fixtures {
  /** The login of the user the test is signed in as (when `signedIn`). */
  login: string;
  /** CSP violations and console errors seen during the test; checked automatically at the end. */
  pageProblems: string[];
  /**
   * Runs axe on the current page and fails with a readable list of WCAG violations. Pass a
   * selector to check only an open modal (menu or dialog): while it's open the rest of the page is
   * correctly hidden from assistive technology, which axe would otherwise report.
   */
  expectAccessible: (page: Page, include?: string) => Promise<void>;
}

export const test = base.extend<Fixtures & Options>({
  consentCookie: [REJECTED_CONSENT, { option: true }],
  signedIn: [true, { option: true }],

  login: [
    async ({ page, signedIn }, use) => {
      await use(signedIn ? await signIn(page, uniqueLogin()) : "");
    },
    { auto: true },
  ],

  context: async ({ context, consentCookie, baseURL }, use) => {
    // Never call Google from tests (and work offline): answer GA with an empty script.
    await context.route(/googletagmanager\.com|google-analytics\.com/, (route) =>
      route.fulfill({ status: 200, contentType: "text/javascript", body: "" }),
    );
    if (consentCookie !== null) {
      await context.addCookies([{ name: "gsg_consent", value: consentCookie, url: baseURL! }]);
    }
    await use(context);
  },

  pageProblems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (e) => {
          console.error(`CSP violation: ${e.violatedDirective} (${e.sourceFile || e.blockedURI})`);
        });
      });
      page.on("console", (msg) => {
        if (msg.type() === "error") problems.push(msg.text());
      });
      page.on("pageerror", (err) => problems.push(`Uncaught: ${err.message}`));
      await use(problems);
      expect(problems, "no CSP violations or console errors").toEqual([]);
    },
    { auto: true },
  ],

  // Playwright reads fixture dependencies from the first argument, so it must be a pattern.
  // eslint-disable-next-line no-empty-pattern
  expectAccessible: async ({}, use) => {
    await use(async (page, include) => {
      // Colors mid-transition (e.g. a button turning enabled after hydration) aren't the real
      // colors; let CSS transitions and animations settle first.
      await page.waitForFunction(() =>
        document.getAnimations().every((animation) => animation.playState !== "running"),
      );
      const builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
      if (include) builder.include(include);
      const { violations } = await builder.analyze();
      const summary = violations.map(
        (v) =>
          `${v.id} (${v.impact}): ${v.help} → ${v.nodes
            .map((n) => `${n.target.join(" ")} [${n.failureSummary?.replace(/\s+/g, " ") ?? ""}]`)
            .join(", ")}`,
      );
      expect(summary, "WCAG 2.2 AA violations").toEqual([]);
    });
  },
});

export { expect };
