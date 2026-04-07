import type { VizGraphData, VizGraphEdge, VizGraphNode } from "@/types/api";

export function normPath(p: string): string {
  return p.replace(/\\/g, "/");
}

function dirnameOfFile(path: string): string {
  const n = normPath(path);
  const i = n.lastIndexOf("/");
  if (i <= 0) {
    return "";
  }
  return n.slice(0, i);
}

/** Parent folder keys needed for this file, e.g. src/utils/foo.ts → ['src','src/utils'] */
export function requiredFoldersForFile(filePath: string): string[] {
  const dir = dirnameOfFile(filePath);
  if (!dir) {
    return [];
  }
  const parts = dir.split("/").filter(Boolean);
  const acc: string[] = [];
  let prefix = "";
  for (let i = 0; i < parts.length; i++) {
    prefix = i === 0 ? parts[0]! : `${prefix}/${parts[i]}`;
    acc.push(prefix);
  }
  return acc;
}

export function isFileVisibleForExpansion(
  filePath: string,
  expandedFolders: Set<string>,
): boolean {
  return requiredFoldersForFile(filePath).every((f) => expandedFolders.has(f));
}

/** Collect distinct folder paths that exist as prefixes of files (excluding file basename). */
export function collectFolderPaths(filePaths: string[]): Set<string> {
  const folders = new Set<string>();
  for (const p of filePaths) {
    const dir = dirnameOfFile(p);
    if (!dir) {
      continue;
    }
    const parts = dir.split("/").filter(Boolean);
    let prefix = "";
    for (let i = 0; i < parts.length; i++) {
      prefix = i === 0 ? parts[0]! : `${prefix}/${parts[i]}`;
      folders.add(prefix);
    }
  }
  return folders;
}

export function isFolderNodeVisible(
  folderPath: string,
  expandedFolders: Set<string>,
): boolean {
  if (!folderPath.includes("/")) {
    return true;
  }
  const parent = folderPath.slice(0, folderPath.lastIndexOf("/"));
  return expandedFolders.has(parent);
}

export type VisibilityOptions = {
  expandedFolders: Set<string>;
  showFunctions: boolean;
  /** File paths for which function children are shown */
  expandedFunctionFiles: Set<string>;
  /** Limit edges to imports only (no call / contains) */
  directImportsOnly: boolean;
  /** Only include paths under this prefix (normalized, no leading ./) */
  folderPrefix: string | null;
};

function passesFolderPrefix(path: string, prefix: string | null): boolean {
  if (prefix == null || prefix === "") {
    return true;
  }
  const n = normPath(path);
  const pref = normPath(prefix).replace(/\/$/, "");
  return n === pref || n.startsWith(`${pref}/`);
}

/**
 * Build visible graph: folder nodes, file nodes, optional function nodes,
 * and edges (imports; optionally calls/contains).
 */
export function buildVisibleGraph(
  graph: VizGraphData,
  opts: VisibilityOptions,
): VizGraphData & { folderPaths: string[] } {
  const fileNodes = graph.nodes.filter((n) => n.kind === "file");
  let paths = fileNodes.map((n) => normPath(n.filePath));

  if (opts.folderPrefix) {
    paths = paths.filter((p) => passesFolderPrefix(p, opts.folderPrefix));
  }

  const pathSet = new Set(paths);
  const allFolders = collectFolderPaths(paths);

  const visibleFolderPaths: string[] = [];
  for (const fp of [...allFolders].sort()) {
    if (opts.folderPrefix && !passesFolderPrefix(fp, opts.folderPrefix)) {
      continue;
    }
    if (isFolderNodeVisible(fp, opts.expandedFolders)) {
      visibleFolderPaths.push(fp);
    }
  }

  const visibleFileNodes: VizGraphNode[] = [];
  for (const n of fileNodes) {
    const p = normPath(n.filePath);
    if (!pathSet.has(p)) {
      continue;
    }
    if (!isFileVisibleForExpansion(p, opts.expandedFolders)) {
      continue;
    }
    visibleFileNodes.push(n);
  }

  const visibleIds = new Set<string>();
  for (const fp of visibleFolderPaths) {
    visibleIds.add(`folder:${fp}`);
  }
  for (const n of visibleFileNodes) {
    visibleIds.add(n.id);
  }

  const funcNodes: VizGraphNode[] = [];
  if (opts.showFunctions) {
    for (const n of graph.nodes) {
      if (n.kind !== "function") {
        continue;
      }
      const fp = normPath(n.filePath);
      if (!pathSet.has(fp)) {
        continue;
      }
      if (!isFileVisibleForExpansion(fp, opts.expandedFolders)) {
        continue;
      }
      if (!opts.expandedFunctionFiles.has(fp)) {
        continue;
      }
      funcNodes.push(n);
      visibleIds.add(n.id);
    }
  }

  const nodesOut: VizGraphNode[] = [
    ...visibleFileNodes,
    ...funcNodes,
  ];

  let edges = graph.edges.filter(
    (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
  );

  if (opts.directImportsOnly) {
    edges = edges.filter((e) => e.kind === "import");
  } else {
    edges = edges.filter((e) => {
      if (e.kind === "import") {
        return true;
      }
      if (e.kind === "call" || e.kind === "contains") {
        return opts.showFunctions;
      }
      return false;
    });
  }

  return {
    nodes: nodesOut,
    edges,
    folderPaths: visibleFolderPaths,
  };
}

/** Layout-only edges: folder → folder (child), folder → direct file (dagre hints). */
export function buildHierarchyLayoutEdges(
  folderPaths: string[],
  fileNodes: VizGraphNode[],
): VizGraphEdge[] {
  const extra: VizGraphEdge[] = [];
  const folderSet = new Set(folderPaths);

  for (const fp of folderPaths) {
    const parent = fp.includes("/")
      ? fp.slice(0, fp.lastIndexOf("/"))
      : "";
    if (parent && folderSet.has(parent)) {
      extra.push({
        id: `layout:fold:${parent}->${fp}`,
        source: `folder:${parent}`,
        target: `folder:${fp}`,
        kind: "import",
      });
    }
  }

  for (const n of fileNodes) {
    if (n.kind !== "file") {
      continue;
    }
    const dir = dirnameOfFile(n.filePath);
    if (!dir) {
      continue;
    }
    if (folderSet.has(dir)) {
      extra.push({
        id: `layout:member:${dir}->${n.id}`,
        source: `folder:${dir}`,
        target: n.id,
        kind: "import",
      });
    }
  }

  return extra;
}
