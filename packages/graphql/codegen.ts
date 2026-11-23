import type { CodegenConfig } from "@graphql-codegen/cli";

/** Generates typed documents (TypedDocumentNode) from the API's schema and our operations. */
const config: CodegenConfig = {
  schema: "../../apps/api/schema.graphql",
  documents: ["src/operations/**/*.graphql"],
  ignoreNoDocuments: false,
  generates: {
    "src/generated/": {
      preset: "client",
      presetConfig: { fragmentMasking: false },
      config: {
        useTypeImports: true,
        enumsAsTypes: true,
        scalars: { DateTime: "string" },
      },
    },
  },
};

export default config;
