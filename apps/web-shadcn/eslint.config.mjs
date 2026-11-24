import next from "@getsetgo/config/eslint/next";

export default [
  ...next,
  // shadcn/ui components are generated code; keep them as close to upstream as possible.
  {
    ignores: [
      ".next/**",
      "next-env.d.ts",
      "src/components/ui/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
];
