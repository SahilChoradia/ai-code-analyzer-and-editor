import type { SerializedAstNode } from "../../utils/astSerializer.js";
import { COMPLEXITY_NODE_TYPES } from "./languageRegistry.js";

/**
 * Approximate cyclomatic complexity for a serialized AST subtree.
 * Starts at 1; each decision construct adds 1. `&&` / `||` add 1 per binary_expression leaf operator.
 */
export function cyclomaticComplexity(node: SerializedAstNode): number {
  let score = 1;

  function walk(n: SerializedAstNode): void {
    if (COMPLEXITY_NODE_TYPES.has(n.type)) {
      score += 1;
    }
    if (n.type === "binary_expression" && n.c) {
      for (const ch of n.c) {
        if (ch.t === "&&" || ch.t === "||") {
          score += 1;
        }
      }
    }
    if (n.c) {
      for (const ch of n.c) {
        walk(ch);
      }
    }
  }

  walk(node);
  return score;
}
