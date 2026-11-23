import {
  type ASTVisitor,
  type FragmentDefinitionNode,
  GraphQLError,
  Kind,
  type SelectionSetNode,
  type ValidationContext,
} from "graphql";

/**
 * Rejects queries nested deeper than `maxDepth`, so a client can't send a huge recursive query
 * to exhaust the server (OWASP A04, denial of service). Introspection fields are not counted.
 */
export function depthLimit(maxDepth: number) {
  return (context: ValidationContext): ASTVisitor => {
    const fragments = new Map<string, FragmentDefinitionNode>();
    for (const def of context.getDocument().definitions) {
      if (def.kind === Kind.FRAGMENT_DEFINITION) fragments.set(def.name.value, def);
    }

    const measure = (selectionSet: SelectionSetNode, depth: number, seen: Set<string>): number => {
      let max = depth;
      for (const selection of selectionSet.selections) {
        if (selection.kind === Kind.FIELD) {
          if (selection.name.value.startsWith("__")) continue;
          if (selection.selectionSet) {
            max = Math.max(max, measure(selection.selectionSet, depth + 1, seen));
          }
        } else if (selection.kind === Kind.INLINE_FRAGMENT) {
          max = Math.max(max, measure(selection.selectionSet, depth, seen));
        } else {
          const name = selection.name.value;
          const fragment = fragments.get(name);
          if (fragment && !seen.has(name)) {
            max = Math.max(max, measure(fragment.selectionSet, depth, new Set(seen).add(name)));
          }
        }
      }
      return max;
    };

    return {
      OperationDefinition(node) {
        const depth = measure(node.selectionSet, 0, new Set());
        if (depth > maxDepth) {
          context.reportError(
            new GraphQLError(`Query is too deep (${depth} levels; the maximum is ${maxDepth}).`, {
              nodes: [node],
            }),
          );
        }
      },
    };
  };
}
