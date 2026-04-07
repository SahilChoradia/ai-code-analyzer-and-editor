import path from "node:path";
import type { SerializedAstNode } from "../../utils/astSerializer.js";
import { IMPORT_NODE_TYPES, languageKey } from "./languageRegistry.js";
import { collectStringLiterals } from "./astUtils.js";
import type { ExtractedImport } from "./types.js";

/**
 * Heuristic: package-like specifiers without `./` / `../` / `/` path separators.
 */
function isExternalSpecifier(spec: string): boolean {
  const s = spec.trim();
  if (!s || s.startsWith(".") || s.startsWith("/")) {
    return false;
  }
  if (s.startsWith("@") && !s.startsWith("@/")) {
    return true;
  }
  return !s.includes(path.sep) && !s.startsWith("..");
}

/**
 * Extracts import/module specifiers from import-related AST nodes.
 */
export function extractImportsFromAst(
  root: SerializedAstNode,
  language: string,
): ExtractedImport[] {
  const lang = languageKey(language);
  const importTypes = IMPORT_NODE_TYPES[lang];
  const seen = new Set<string>();
  const out: ExtractedImport[] = [];

  function walk(node: SerializedAstNode): void {
    if (importTypes.has(node.type)) {
      const literals = collectStringLiterals(node);
      for (const spec of literals) {
        const key = `${node.type}:${spec}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        out.push({
          specifier: spec,
          isExternal: isExternalSpecifier(spec),
        });
      }
    }
    if (node.c) {
      for (const ch of node.c) {
        walk(ch);
      }
    }
  }

  walk(root);
  return out;
}

/**
 * Resolves a relative specifier from `fromFile` to a normalized POSIX path if it matches a project file.
 */
export function resolveInternalImport(
  fromFile: string,
  specifier: string,
  projectPaths: Set<string>,
): string | null {
  const s = specifier.trim();
  if (!s.startsWith(".") && !s.startsWith("/")) {
    return null;
  }
  const dir = path.posix.dirname(fromFile.replace(/\\/g, "/"));
  let resolved = path.posix.normalize(path.posix.join(dir, s));
  if (resolved.startsWith("/")) {
    resolved = resolved.slice(1);
  }
  const candidates = [
    resolved,
    `${resolved}.ts`,
    `${resolved}.tsx`,
    `${resolved}.js`,
    `${resolved}.jsx`,
    `${resolved}.py`,
    `${resolved}.java`,
    `${resolved}.cpp`,
    `${resolved}.c`,
    path.posix.join(resolved, "index.ts"),
    path.posix.join(resolved, "index.js"),
  ];
  for (const c of candidates) {
    if (projectPaths.has(c)) {
      return c;
    }
  }
  return null;
}
