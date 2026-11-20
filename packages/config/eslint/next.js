// ESLint flat config for the Next.js apps: React, hooks, Next.js rules and WCAG-focused a11y rules.
import nextPlugin from "@next/eslint-plugin-next";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

import base from "./base.js";

/** @type {import("typescript-eslint").ConfigArray} */
export default tseslint.config(...base, {
  files: ["**/*.{js,jsx,mjs,ts,tsx}"],
  plugins: {
    react,
    "react-hooks": reactHooks,
    "jsx-a11y": jsxA11y,
    "@next/next": nextPlugin,
  },
  languageOptions: {
    globals: { ...globals.browser, ...globals.node },
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
  settings: { react: { version: "detect" } },
  rules: {
    ...react.configs.recommended.rules,
    ...react.configs["jsx-runtime"].rules,
    ...reactHooks.configs.recommended.rules,
    // Principle IV (WCAG 2.2): strict a11y rules are errors, not warnings.
    ...jsxA11y.flatConfigs.strict.rules,
    ...nextPlugin.configs.recommended.rules,
    ...nextPlugin.configs["core-web-vitals"].rules,
    "react/prop-types": "off",
    // Principle III (OWASP A03): flag raw HTML injection for review.
    "react/no-danger": "error",
    "react/jsx-no-target-blank": "error",
  },
});
