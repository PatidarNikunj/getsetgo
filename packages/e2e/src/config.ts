import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";

/**
 * Shared Playwright config for a web app. The app is started with `next start` (build first);
 * the API must already be running (`pnpm infra:up && pnpm stack:up`, or `pnpm dev`).
 */
export function webAppConfig({ port }: { port: number }): PlaywrightTestConfig {
  const baseURL = `http://localhost:${port}`;
  const isCI = !!process.env.CI;
  return defineConfig({
    testDir: "./e2e",
    // Resolved from each app folder (where this package is linked into node_modules).
    globalSetup: "./node_modules/@getsetgo/e2e/src/global-setup.ts",
    fullyParallel: true,
    forbidOnly: isCI,
    retries: isCI ? 1 : 0,
    reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"]],
    use: {
      baseURL,
      trace: "retain-on-failure",
      launchOptions: {
        // Optional: use a preinstalled Chromium instead of `playwright install` (e.g. sandboxes).
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
      },
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: {
      command: `pnpm exec next start --port ${port}`,
      url: baseURL,
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
  });
}
