"use client";

import { colors, fontFamily, minTargetSize, radius } from "@getsetgo/ui-tokens";
import { createTheme } from "@mui/material/styles";

const palette = (scheme: typeof colors.light) => ({
  primary: { main: scheme.primary, contrastText: scheme.primaryForeground },
  error: { main: scheme.danger, contrastText: scheme.dangerForeground },
  success: { main: scheme.success, contrastText: scheme.successForeground },
  info: { main: scheme.info, contrastText: scheme.infoForeground },
  background: { default: scheme.background, paper: scheme.surface },
  text: { primary: scheme.foreground, secondary: scheme.mutedForeground },
  divider: scheme.border,
});

/**
 * MUI theme built from the shared design tokens (same palette as web-shadcn). CSS variables let
 * light/dark switch without re-rendering; the `class` selector toggles .light/.dark on <html>.
 */
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: "class" },
  colorSchemes: {
    light: { palette: palette(colors.light) },
    dark: { palette: palette(colors.dark) },
  },
  shape: { borderRadius: radius.md },
  typography: { fontFamily: fontFamily.sans, button: { textTransform: "none", fontWeight: 600 } },
  components: {
    // WCAG 2.5.8: comfortable target sizes for every button.
    MuiButton: { styleOverrides: { root: { minHeight: minTargetSize } } },
    MuiIconButton: {
      styleOverrides: { root: { minWidth: minTargetSize, minHeight: minTargetSize } },
    },
    // WCAG 2.4.7 / 2.4.11: an obvious keyboard focus ring (MUI's default ripple isn't enough).
    MuiButtonBase: {
      defaultProps: { disableRipple: false },
      styleOverrides: {
        root: ({ theme }) => ({
          "&.Mui-focusVisible": {
            outline: `3px solid ${theme.vars.palette.primary.main}`,
            outlineOffset: 2,
          },
        }),
      },
    },
  },
});
