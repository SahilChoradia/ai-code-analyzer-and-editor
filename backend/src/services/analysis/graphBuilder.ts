import type { DependencyEdge, ExtractedImport } from "./types.js";
import { resolveInternalImport } from "./importExtractor.js";

/**
 * Builds a file-level dependency graph from extracted imports.
 */
export function buildDependencyGraph(
  filePath: string,
  imports: ExtractedImport[],
  projectPaths: Set<string>,
): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  for (const imp of imports) {
    if (imp.isExternal) {
      continue;
    }
    const target = resolveInternalImport(filePath, imp.specifier, projectPaths);
    if (target) {
      edges.push({ from: filePath, to: target, kind: "imports" });
    }
  }
  return edges;
}

export function mergeGraphNodes(
  files: string[],
  edges: DependencyEdge[],
): string[] {
  const nodes = new Set<string>(files);
  for (const e of edges) {
    nodes.add(e.from);
    nodes.add(e.to);
  }
  return [...nodes].sort();
}
