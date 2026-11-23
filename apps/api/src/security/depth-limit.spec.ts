import { buildSchema, parse, specifiedRules, validate } from "graphql";

import { depthLimit } from "./depth-limit.rule";

// A self-referencing type, so queries can be nested arbitrarily deep.
const schema = buildSchema(`
  type Person { name: String, friend: Person }
  type Query { me: Person }
`);

const nested = (levels: number): string =>
  `{ me ${"{ friend ".repeat(levels - 1)}{ name }${" }".repeat(levels - 1)} }`;

const errorsFor = (query: string, max = 3): string[] =>
  validate(schema, parse(query), [...specifiedRules, depthLimit(max)]).map((e) => e.message);

describe("depthLimit", () => {
  it("allows queries within the limit", () => {
    expect(errorsFor(nested(3))).toEqual([]);
  });

  it("rejects queries deeper than the limit", () => {
    expect(errorsFor(nested(5))).toEqual(["Query is too deep (5 levels; the maximum is 3)."]);
  });

  it("counts depth through fragments", () => {
    const query = `
      { me { ...F } }
      fragment F on Person { friend { friend { friend { name } } } }
    `;
    expect(errorsFor(query)).toHaveLength(1);
  });

  it("ignores introspection fields", () => {
    expect(errorsFor("{ __schema { types { fields { type { name } } } } }", 1)).toEqual([]);
  });
});
