import type { SerializedAstNode } from "../../utils/astSerializer.js";
import { findFirstNameToken } from "./astUtils.js";
import { FUNCTION_NODE_TYPES, languageKey } from "./languageRegistry.js";

/** Tree-sitter-ish node types that represent a call site. */
const CALL_ROOT_TYPES = new Set([
  "call_expression",
  "call",
  "method_invocation",
  "new_expression",
]);

export interface IntraFileCallEdge {
  fromFunction: string;
  toFunction: string;
}

function normName(name: string): string {
  return name.trim();
}

function calleeFromCallRoot(node: SerializedAstNode): string | null {
  if (!node.c?.length) {
    return null;
  }
  const calleeRoot = node.c[0];
  if (calleeRoot.type === "identifier" && calleeRoot.t) {
    return normName(calleeRoot.t);
  }
  if (calleeRoot.type === "property_identifier" && calleeRoot.t) {
    return normName(calleeRoot.t);
  }
  if (calleeRoot.type === "member_expression" && calleeRoot.c?.length) {
    const last = calleeRoot.c[calleeRoot.c.length - 1];
    if (last.type === "property_identifier" && last.t) {
      return normName(last.t);
    }
    if (last.t) {
      return normName(last.t);
    }
    const nm = findFirstNameToken(last);
    return nm ? normName(nm) : null;
  }
  if (calleeRoot.type === "attribute" && calleeRoot.c?.length) {
    const last = calleeRoot.c[calleeRoot.c.length - 1];
    if (last.t) {
      return normName(last.t);
    }
  }
  const nm = findFirstNameToken(calleeRoot);
  return nm ? normName(nm) : null;
}

function unwrapCallNode(node: SerializedAstNode): SerializedAstNode | null {
  if (CALL_ROOT_TYPES.has(node.type)) {
    return node;
  }
  if (node.type === "await_expression" && node.c?.[0]) {
    return unwrapCallNode(node.c[0]);
  }
  return null;
}

/**
 * Heuristic intra-file call edges by matching callee names to declared functions.
 * Cross-file and dynamic calls are ignored.
 */
export function extractIntraFileCalls(
  root: SerializedAstNode,
  language: string,
  functionNames: Set<string>,
): IntraFileCallEdge[] {
  const edges: IntraFileCallEdge[] = [];
  const seen = new Set<string>();
  const lang = languageKey(language);
  const fnTypes = FUNCTION_NODE_TYPES[lang];

  function dfs(node: SerializedAstNode, stack: string[]): void {
    let pushed: string | null = null;
    if (fnTypes.has(node.type)) {
      const name = findFirstNameToken(node) || "<anonymous>";
      pushed = name;
      stack.push(name);
    }

    if (stack.length > 0) {
      const call = unwrapCallNode(node);
      if (call) {
        const callee = calleeFromCallRoot(call);
        if (callee && functionNames.has(callee)) {
          const from = stack[stack.length - 1];
          if (from !== callee) {
            const key = `${from}→${callee}`;
            if (!seen.has(key)) {
              seen.add(key);
              edges.push({ fromFunction: from, toFunction: callee });
            }
          }
        }
      }
    }

    if (node.c) {
      for (const ch of node.c) {
        dfs(ch, stack);
      }
    }

    if (pushed) {
      stack.pop();
    }
  }

  dfs(root, []);
  return edges;
}
