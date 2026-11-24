import { fileURLToPath } from "node:url";

import preset from "@getsetgo/config/vitest/react";
import react from "@vitejs/plugin-react";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  preset,
  defineConfig({
    plugins: [react()],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    test: { globals: true, setupFiles: ["./src/test/setup.ts"] },
  }),
);
