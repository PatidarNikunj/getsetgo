// Vitest preset for shared packages and Node code.
// Usage in a package's vitest.config.ts:
//   import { mergeConfig } from "vitest/config";
//   import preset from "@getsetgo/config/vitest/node";
//   export default mergeConfig(preset, { /* overrides */ });
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**"],
    },
  },
});
