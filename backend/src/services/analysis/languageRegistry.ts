/**
 * Tree-sitter node `type` strings used to recognize constructs per language family.
 * Names align with common tree-sitter grammars (may miss edge cases on truncated ASTs).
 */

export const FUNCTION_NODE_TYPES: Record<string, Set<string>> = {
  javascript: new Set([
    "function_declaration",
    "function",
    "arrow_function",
    "method_definition",
    "generator_function",
  ]),
  typescript: new Set([
    "function_declaration",
    "function",
    "arrow_function",
    "method_definition",
    "generator_function",
  ]),
  python: new Set(["function_definition", "lambda"]),
  java: new Set([
    "method_declaration",
    "constructor_declaration",
    "lambda_expression",
  ]),
  cpp: new Set(["function_definition"]),
  c: new Set(["function_definition"]),
};

export const CLASS_NODE_TYPES: Record<string, Set<string>> = {
  javascript: new Set(["class_declaration"]),
  typescript: new Set(["class_declaration", "interface_declaration"]),
  python: new Set(["class_definition"]),
  java: new Set(["class_declaration", "interface_declaration", "enum_declaration"]),
  cpp: new Set(["class_specifier", "struct_specifier"]),
  c: new Set(["struct_specifier"]),
};

export const IMPORT_NODE_TYPES: Record<string, Set<string>> = {
  javascript: new Set(["import_statement", "export_statement"]),
  typescript: new Set(["import_statement", "export_statement"]),
  python: new Set(["import_statement", "import_from_statement"]),
  java: new Set(["import_declaration"]),
  cpp: new Set(["preproc_include"]),
  c: new Set(["preproc_include"]),
};

/** Node types that add +1 to cyclomatic complexity (McCabe-style, simplified). */
export const COMPLEXITY_NODE_TYPES = new Set([
  "if_statement",
  "else_clause",
  "for_statement",
  "for_in_statement",
  "enhanced_for_statement",
  "while_statement",
  "do_statement",
  "catch_clause",
  "ternary_expression",
  "switch_statement",
  "case_statement",
  "elif_clause",
  "with_statement",
  "match_statement",
]);

/** Depth is measured through structural / block-like nodes. */
export const NESTING_NODE_TYPES = new Set([
  "statement_block",
  "block",
  "class_body",
  "switch_body",
  "module",
]);

export function languageKey(lang: string): keyof typeof FUNCTION_NODE_TYPES {
  if (lang in FUNCTION_NODE_TYPES) {
    return lang as keyof typeof FUNCTION_NODE_TYPES;
  }
  return "javascript";
}
