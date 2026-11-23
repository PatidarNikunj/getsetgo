import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { colors, type ColorScheme, contrastRatio } from "./index";

const AA_TEXT = 4.5; // WCAG 2.2 SC 1.4.3, normal text
const AA_UI = 3; // WCAG 2.2 SC 1.4.11, borders/focus indicators against the background

const textPairs: [keyof ColorScheme, keyof ColorScheme][] = [
  ["foreground", "background"],
  ["foreground", "surface"],
  ["mutedForeground", "background"],
  ["mutedForeground", "muted"],
  ["primaryForeground", "primary"],
  ["dangerForeground", "danger"],
  ["primary", "background"],
  ["danger", "background"],
];

describe.each(Object.entries(colors))("%s scheme", (_name, scheme) => {
  it.each(textPairs)("%s on %s meets AA text contrast", (fg, bg) => {
    expect(contrastRatio(scheme[fg], scheme[bg])).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("focus ring is visible against the background", () => {
    expect(contrastRatio(scheme.focus, scheme.background)).toBeGreaterThanOrEqual(AA_UI);
  });
});

describe("tokens.css", () => {
  const css = readFileSync(new URL("../tokens.css", import.meta.url), "utf8");
  const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

  it.each(Object.entries(colors.light))("light --gsg-%s matches", (key, value) => {
    expect(css).toContain(`--gsg-${kebab(key)}: ${value};`);
  });

  it.each(Object.entries(colors.dark))("dark --gsg-%s matches", (key, value) => {
    const darkBlock = css.slice(css.indexOf(':root[data-theme="dark"]'));
    expect(darkBlock).toContain(`--gsg-${kebab(key)}: ${value};`);
  });
});
