import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test as base } from "@playwright/test";

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
}

interface Fixtures {
  /** CSP violations and console errors seen during the test; checked automatically at the end. */
  pageProblems: string[];
  /** Runs axe on the current page and fails with a readable list of WCAG violations. */
  expectAccessible: (page: Page) => Promise<void>;
}

export const test = base.extend<Fixtures & Options>({
  consentCookie: [REJECTED_CONSENT, { option: true }],

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
    await use(async (page) => {
      const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      const summary = violations.map(
        (v) =>
          `${v.id} (${v.impact}): ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
      );
      expect(summary, "WCAG 2.2 AA violations").toEqual([]);
    });
  },
});

export { expect };
