import type { SerializedAstNode } from "../../utils/astSerializer.js";

/**
 * DFS to find the first usable name token in a declaration subtree.
 */
export function findFirstNameToken(node: SerializedAstNode): string {
  const nameTypes = new Set([
    "identifier",
    "type_identifier",
    "property_identifier",
    "field_identifier",
  ]);
  if (nameTypes.has(node.type) && node.t) {
    return node.t;
  }
  if (!node.c) {
    return "";
  }
  for (const ch of node.c) {
    const n = findFirstNameToken(ch);
    if (n) {
      return n;
    }
  }
  return "";
}

/**
 * Total nodes in subtree.
 */
export function countSubtreeNodes(node: SerializedAstNode): number {
  let n = 1;
  if (node.c) {
    for (const ch of node.c) {
      n += countSubtreeNodes(ch);
    }
  }
  return n;
}

/**
 * Maximum depth counting only “structural” nodes (blocks / bodies).
 */
export function maxStructuralDepth(
  node: SerializedAstNode,
  structuralTypes: Set<string>,
  depth = 0,
): number {
  let max = structuralTypes.has(node.type) ? depth : 0;
  if (!node.c) {
    return max;
  }
  const nextDepth = structuralTypes.has(node.type) ? depth + 1 : depth;
  for (const ch of node.c) {
    max = Math.max(max, maxStructuralDepth(ch, structuralTypes, nextDepth));
  }
  return max;
}

/**
 * Whether any node in the tree is truncated (serializer cap).
 */
export function hasTruncation(node: SerializedAstNode): boolean {
  if (node.trunc) {
    return true;
  }
  if (!node.c) {
    return false;
  }
  return node.c.some(hasTruncation);
}

/**
 * Whether any node carries a parse error flag from Tree-sitter.
 */
export function hasParseErrorFlag(node: SerializedAstNode): boolean {
  if (node.err) {
    return true;
  }
  if (!node.c) {
    return false;
  }
  return node.c.some(hasParseErrorFlag);
}

/**
 * Collects string literal `t` values (import paths, etc.).
 */
export function collectStringLiterals(node: SerializedAstNode): string[] {
  const out: string[] = [];
  const stringTypes = new Set([
    "string",
    "string_literal",
    "interpreted_string_literal",
    "system_lib_string",
  ]);
  if (stringTypes.has(node.type) && node.t) {
    const raw = node.t.replace(/^['"`]|['"`]$/g, "");
    if (raw.length > 0) {
      out.push(raw);
    }
  }
  if (node.c) {
    for (const ch of node.c) {
      out.push(...collectStringLiterals(ch));
    }
  }
  return out;
}
