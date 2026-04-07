import type Parser from "web-tree-sitter";

/**
 * Compact JSON-friendly AST node for MongoDB storage.
 */
export interface SerializedAstNode {
  type: string;
  /** Short text (identifiers / literals) when useful; truncated when long. */
  t?: string;
  /** Named children only (cleaner than anonymous punctuation). */
  c?: SerializedAstNode[];
  /** Present when Tree-sitter reported a parse error in this subtree. */
  err?: boolean;
  /** Missing token placeholder from Tree-sitter. */
  miss?: boolean;
  /** Tree was cut off due to size limits. */
  trunc?: boolean;
}

export interface SerializeOptions {
  maxDepth: number;
  maxNodes: number;
  maxTextLen: number;
}

/**
 * Converts a Tree-sitter tree to a bounded JSON structure for persistence / LLM prompts.
 */
export function serializeSyntaxTree(
  root: Parser.SyntaxNode,
  options: SerializeOptions,
): SerializedAstNode {
  let visited = 0;

  function walk(node: Parser.SyntaxNode, depth: number): SerializedAstNode {
    visited += 1;
    if (visited > options.maxNodes) {
      return { type: node.type, trunc: true };
    }
    if (depth > options.maxDepth) {
      return { type: node.type, trunc: true };
    }

    const out: SerializedAstNode = { type: node.type };
    if (node.hasError) {
      out.err = true;
    }
    if (node.isMissing) {
      out.miss = true;
    }

    const named = node.namedChildren;
    if (named.length > 0) {
      out.c = named.map((ch) => walk(ch, depth + 1));
      return out;
    }

    const text = node.text;
    if (text.length <= options.maxTextLen) {
      out.t = text;
    } else {
      out.t = `${text.slice(0, options.maxTextLen)}…`;
    }
    return out;
  }

  return walk(root, 0);
}

/**
 * Counts nodes in a serialized AST (approximate size metric).
 */
export function countSerializedNodes(node: SerializedAstNode): number {
  let n = 1;
  if (node.c) {
    for (const ch of node.c) {
      n += countSerializedNodes(ch);
    }
  }
  return n;
}
