import type { SerializedAstNode } from "./astSerializer.js";

/**
 * Turns a bounded serialized AST into a compact text outline for LLM prompts
 * (not full source — structural + short leaf text only).
 */
export function astToCompactOutline(
  root: SerializedAstNode,
  maxNodes: number,
  maxChars: number,
): string {
  let nodesVisited = 0;
  let charBudget = maxChars;
  const lines: string[] = [];

  function walk(node: SerializedAstNode, depth: number): void {
    if (charBudget <= 0 || nodesVisited >= maxNodes) {
      return;
    }
    nodesVisited += 1;
    const indent = "  ".repeat(Math.min(depth, 12));
    let line = `${indent}${node.type}`;
    if (node.t !== undefined) {
      const t =
        node.t.length > 120 ? `${node.t.slice(0, 117)}…` : node.t;
      line += ` "${t}"`;
    }
    if (node.err) {
      line += " [parse-error]";
    }
    if (node.trunc) {
      line += " [truncated]";
    }
    line += "\n";
    if (line.length > charBudget) {
      lines.push(line.slice(0, charBudget));
      charBudget = 0;
      return;
    }
    lines.push(line);
    charBudget -= line.length;
    if (node.c && charBudget > 0 && nodesVisited < maxNodes) {
      for (const ch of node.c) {
        walk(ch, depth + 1);
        if (charBudget <= 0 || nodesVisited >= maxNodes) {
          break;
        }
      }
    }
  }

  walk(root, 0);
  if (nodesVisited >= maxNodes && charBudget > 0) {
    lines.push("…[outline node budget reached]\n");
  }
  return lines.join("");
}
