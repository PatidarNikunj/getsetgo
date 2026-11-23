import node from "@getsetgo/config/eslint/node";

export default [...node, { ignores: ["src/generated/**", "src/ai/ai-api.d.ts", "schema.graphql"] }];
