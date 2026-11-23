/**
 * Design tokens shared by both web apps: web-material feeds them into the MUI theme, web-shadcn
 * reads the same values as CSS variables from `@getsetgo/ui-tokens/tokens.css`.
 * Every text/background pair is checked against WCAG 2.2 AA contrast in the tests.
 */

export interface ColorScheme {
  background: string;
  surface: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  primary: string;
  primaryForeground: string;
  danger: string;
  dangerForeground: string;
  focus: string;
}

export const colors: { light: ColorScheme; dark: ColorScheme } = {
  light: {
    background: "#ffffff",
    surface: "#f8fafc",
    foreground: "#0f172a",
    muted: "#f1f5f9",
    mutedForeground: "#475569",
    border: "#cbd5e1",
    primary: "#4338ca",
    primaryForeground: "#ffffff",
    danger: "#b91c1c",
    dangerForeground: "#ffffff",
    focus: "#4338ca",
  },
  dark: {
    background: "#0b1120",
    surface: "#111827",
    foreground: "#f1f5f9",
    muted: "#1e293b",
    mutedForeground: "#cbd5e1",
    border: "#475569",
    primary: "#a5b4fc",
    primaryForeground: "#1e1b4b",
    danger: "#fca5a5",
    dangerForeground: "#450a0a",
    focus: "#a5b4fc",
  },
};

export const radius = { sm: 6, md: 8, lg: 12 } as const;

/** System fonts: fast, private (no third-party font requests), and familiar to each platform. */
export const fontFamily = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
} as const;

/** Minimum interactive target size in CSS px (WCAG 2.2 SC 2.5.8 requires at least 24). */
export const minTargetSize = 40;

// ---------- WCAG contrast helpers ----------

function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const [r = 0, g = 0, b = 0] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
