// Vitest preset for React components (Next.js apps and UI packages).
// Requires `jsdom` and `@testing-library/jest-dom` in the consuming package.
import { defineConfig, mergeConfig } from "vitest/config";

import node from "./node.js";

export default mergeConfig(
  node,
  defineConfig({
    test: {
      environment: "jsdom",
      include: ["src/**/*.{test,spec}.{ts,tsx}", "app/**/*.{test,spec}.{ts,tsx}"],
      css: false,
    },
  }),
);
