import next from "@getsetgo/config/eslint/next";

export default [
  ...next,
  { ignores: [".next/**", "next-env.d.ts", "playwright-report/**", "test-results/**"] },
  {
    // Constitution II: this app is the MUI + Apollo + Redux + Formik/Yup stack. Keep the
    // web-shadcn stack's libraries out of it.
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["@tanstack/react-query", "zustand", "react-hook-form", "zod", "sonner"].map(
            (name) => ({ name, message: "Belongs to web-shadcn (constitution II)." }),
          ),
          patterns: [{ group: ["@radix-ui/*", "radix-ui"], message: "Belongs to web-shadcn." }],
        },
      ],
    },
  },
];
