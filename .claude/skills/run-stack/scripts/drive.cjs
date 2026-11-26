// Drives both web apps like a person: sign in (test provider), create a note, reload (server
// render), summarize, delete. Usage: node drive.cjs <screenshot-dir> [material|shadcn]
// Run it from apps/web-shadcn (or any folder where `require("playwright")` resolves).
const { chromium } = require("playwright");

const out = process.argv[2] ?? ".";
const only = process.argv[3];
const apps = [
  ["material", "http://localhost:3000"],
  ["shadcn", "http://localhost:3001"],
].filter(([name]) => !only || name === only);

async function run(browser, name, base) {
  const errors = [];
  const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1280, height: 860 } });
  // Same as the e2e fixture: never call Google; answer GA with an empty script.
  await ctx.route(
    (url) => /(^|\.)(googletagmanager|google-analytics)\.com$/.test(url.hostname),
    (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }),
  );
  const page = await ctx.newPage();
  globalThis.lastPage = page;
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  const step = (s) => console.log(`${name}: ${s}`);

  await page.goto(base + "/");
  step(`signed-out visit to / lands on ${new URL(page.url()).pathname}`);
  await page.screenshot({ path: `${out}/${name}-1-sign-in.png` });

  await page.getByRole("button", { name: "Continue with test provider" }).click();
  await page.getByRole("textbox", { name: "Test identity" }).fill(`e2e-demo-${name}-${Date.now().toString(36)}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Account menu" }).waitFor();
  step(`signed in, now on ${new URL(page.url()).pathname}`);

  // Wait for React to hydrate before touching anything: "Save note" stays disabled until then,
  // and input typed earlier is lost (docs/frontends.md, known limitation).
  const save = page.getByRole("button", { name: "Save note" });
  for (let i = 0; i < 60 && !(await save.isEnabled()); i++) await page.waitForTimeout(500);
  await page.waitForLoadState("networkidle");

  const reject = page.getByRole("button", { name: /reject/i }).first();
  if (await reject.isVisible().catch(() => false)) {
    await reject.click();
    step("cookie banner shown, chose Reject");
  }

  const title = `Smoke test ${name}`;
  await page.getByRole("textbox", { name: "Title" }).fill(title);
  await page.getByRole("textbox", { name: "Note", exact: true }).fill("Run-stack smoke test.");
  await save.click();
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  step("created a note");

  await page.reload();
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  step("note still there after reload (server-rendered via the API)");

  const item = page.locator("main li").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await item.getByRole("button", { name: "Summarize" }).click();
  // Without ANTHROPIC_API_KEY the app shows "AI summaries are unavailable right now." instead.
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${out}/${name}-2-notes.png` });
  step("clicked Summarize (see screenshot for the summary or the 'unavailable' notice)");

  await item.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await page.getByRole("heading", { name: title, exact: true }).waitFor({ state: "detached" });
  step("deleted the note");

  step(errors.length ? `console errors: ${errors.join(" | ")}` : "no console errors");
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  let failed = false;
  try {
    for (const [name, base] of apps) {
      try {
        await run(browser, name, base);
      } catch (e) {
        failed = true;
        await globalThis.lastPage?.screenshot({ path: `${out}/${name}-FAILED.png` }).catch(() => {});
        console.log(`${name}: FAILED: ${e.message.split("\n").slice(0, 4).join(" / ")}`);
      }
    }
  } finally {
    await browser.close();
  }
  process.exitCode = failed ? 1 : 0;
})();
