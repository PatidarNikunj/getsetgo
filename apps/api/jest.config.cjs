/** Unit tests: src/**\/*.spec.ts. End-to-end tests live in test/ (see test/jest-e2e.config.js). */
module.exports = {
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  transform: { "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/../tsconfig.json" }] },
  moduleFileExtensions: ["ts", "js", "json"],
  // Generated Prisma code imports sibling .ts files with ".js" extensions (ESM style).
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
  testEnvironment: "node",
  collectCoverageFrom: ["**/*.ts", "!generated/**", "!main.ts"],
  coverageDirectory: "../coverage",
};
