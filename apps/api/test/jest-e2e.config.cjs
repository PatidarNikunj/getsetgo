/** End-to-end tests: boot the full app against the local Docker databases (pnpm infra:up). */
module.exports = {
  rootDir: ".",
  testRegex: ".*\\.e2e-spec\\.ts$",
  transform: { "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/../tsconfig.json" }] },
  moduleFileExtensions: ["ts", "js", "json"],
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
  testEnvironment: "node",
  testTimeout: 30_000,
};
