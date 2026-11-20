// ESLint flat config for Node.js services (NestJS) and Node-only packages.
import globals from "globals";
import tseslint from "typescript-eslint";

import base from "./base.js";

/** @type {import("typescript-eslint").ConfigArray} */
export default tseslint.config(...base, {
  languageOptions: {
    globals: { ...globals.node },
  },
  rules: {
    // NestJS relies on classes with decorators and empty constructors for DI.
    "@typescript-eslint/no-extraneous-class": "off",
    // Decorator metadata needs runtime imports of types used in constructors.
    "@typescript-eslint/consistent-type-imports": "off",
  },
});
