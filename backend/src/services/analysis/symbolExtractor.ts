import type { SerializedAstNode } from "../../utils/astSerializer.js";
import {
  CLASS_NODE_TYPES,
  FUNCTION_NODE_TYPES,
  NESTING_NODE_TYPES,
  languageKey,
} from "./languageRegistry.js";
import {
  countSubtreeNodes,
  findFirstNameToken,
  maxStructuralDepth,
} from "./astUtils.js";
import { cyclomaticComplexity } from "./complexity.js";
import type { ExtractedClass, ExtractedFunction } from "./types.js";

function classKind(
  type: string,
  lang: string,
): "class" | "interface" | "enum" {
  if (type === "interface_declaration") {
    return "interface";
  }
  if (type === "enum_declaration") {
    return "enum";
  }
  if (lang === "cpp" || lang === "c") {
    if (type === "struct_specifier") {
      return "class";
    }
  }
  return "class";
}

/**
 * Walks a file AST and extracts functions/classes for the given scanner language.
 */
export function extractSymbolsFromAst(
  root: SerializedAstNode,
  language: string,
): { functions: ExtractedFunction[]; classes: ExtractedClass[] } {
  const lang = languageKey(language);
  const fnTypes = FUNCTION_NODE_TYPES[lang];
  const clsTypes = CLASS_NODE_TYPES[lang];

  const functions: ExtractedFunction[] = [];
  const classes: ExtractedClass[] = [];

  function walk(node: SerializedAstNode): void {
    if (fnTypes.has(node.type)) {
      const name = findFirstNameToken(node) || "<anonymous>";
      functions.push({
        name,
        cyclomaticComplexity: cyclomaticComplexity(node),
        approxNodeCount: countSubtreeNodes(node),
        maxNestingDepth: maxStructuralDepth(node, NESTING_NODE_TYPES),
      });
    }
    if (clsTypes.has(node.type)) {
      const name = findFirstNameToken(node) || "<unnamed>";
      classes.push({
        name,
        kind: classKind(node.type, lang),
      });
    }
    if (node.c) {
      for (const ch of node.c) {
        walk(ch);
      }
    }
  }

  walk(root);
  return { functions, classes };
}
