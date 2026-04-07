import type { Edge, Node } from "@xyflow/react";
import type { VizGraphData, VizGraphEdge, VizGraphNode } from "@/types/api";
import { applyDagreLayout, type DagreEdge } from "@/lib/dagreLayout";
import {
  buildHierarchyLayoutEdges,
  buildVisibleGraph,
  normPath,
  type VisibilityOptions,
} from "@/lib/graphVisibility";

export type { VisibilityOptions };

export function filterVisualizationGraph(
  graph: VizGraphData,
  highComplexityOnly: boolean,
  problematicOnly: boolean,
): VizGraphData {
  if (!highComplexityOnly && !problematicOnly) {
    return graph;
  }

  const keepFiles = new Set<string>();
  for (const n of graph.nodes) {
    if (n.kind !== "file") {
      continue;
    }
    const isHigh = n.complexityTier === "high";
    const isProb =
      (n.smellCount ?? 0) > 0 ||
      n.complexityTier !== "low" ||
      (n.ai?.issueCount ?? 0) > 0;
    const ok =
      (!highComplexityOnly || isHigh) && (!problematicOnly || isProb);
    if (ok) {
      keepFiles.add(n.filePath.replace(/\\/g, "/"));
    }
  }

  const keepIds = new Set<string>();
  for (const n of graph.nodes) {
    const p = n.filePath.replace(/\\/g, "/");
    if (keepFiles.has(p)) {
      keepIds.add(n.id);
    }
  }

  const nodes = graph.nodes.filter((n) => keepIds.has(n.id));
  const edges = graph.edges.filter(
    (e) => keepIds.has(e.source) && keepIds.has(e.target),
  );
  return { nodes, edges };
}

function edgeVisuals(
  kind: VizGraphEdge["kind"],
  opts: { layoutOnly?: boolean },
): Partial<Edge> {
  if (opts.layoutOnly) {
    return {
      style: { opacity: 0, strokeWidth: 0 },
      interactionWidth: 0,
      selectable: false,
      focusable: false,
    };
  }
  switch (kind) {
    case "import":
      return {
        style: { stroke: "#2563eb", strokeWidth: 1.5 },
        animated: true,
      };
    case "call":
      return {
        style: { stroke: "#ea580c", strokeWidth: 1.2 },
      };
    case "contains":
      return {
        style: { stroke: "#94a3b8", strokeWidth: 1, strokeDasharray: "4 4" },
      };
    default:
      return {};
  }
}

const LAYOUT_ROOT_ID = "layout-root";

function folderDisplayName(folderPath: string): string {
  const parts = folderPath.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? folderPath;
}

function folderStats(
  folderPath: string,
  allFolderPaths: string[],
  filePaths: string[],
): { files: number; subfolders: number } {
  let files = 0;
  let subfolders = 0;
  const prefix = folderPath + "/";
  for (const p of filePaths) {
    if (dirnameOf(p) === folderPath) {
      files += 1;
    }
  }
  for (const fp of allFolderPaths) {
    if (fp.startsWith(prefix) && !fp.slice(prefix.length).includes("/")) {
      subfolders += 1;
    }
  }
  return { files, subfolders };
}

function dirnameOf(path: string): string {
  const n = normPath(path);
  const i = n.lastIndexOf("/");
  if (i <= 0) {
    return "";
  }
  return n.slice(0, i);
}

export type FlowCallbacks = {
  onToggleFolder: (folderPath: string) => void;
  onExpandFileFunctions: (filePath: string) => void;
};

export type BuildFlowOptions = {
  visibility: VisibilityOptions;
  callbacks: FlowCallbacks;
  /** Include invisible layout root for dagre (filtered out before return) */
  useLayoutRoot: boolean;
};

/**
 * Build positioned React Flow nodes and visible edges from graph data.
 */
export function toFlowElements(
  graphData: VizGraphData,
  opts: BuildFlowOptions,
): { nodes: Node[]; edges: Edge[] } {
  const vis = buildVisibleGraph(graphData, opts.visibility);
  const { folderPaths, nodes: vizNodes, edges: vizEdges } = vis;

  const fileNodes = vizNodes.filter((n) => n.kind === "file");
  const funcNodes = vizNodes.filter((n) => n.kind === "function");
  const allFilePaths = graphData.nodes
    .filter((n) => n.kind === "file")
    .map((n) => normPath(n.filePath));

  const hierarchyEdges = buildHierarchyLayoutEdges(folderPaths, fileNodes);

  const layoutEdgeList: DagreEdge[] = [
    ...hierarchyEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    })),
    ...vizEdges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  ];

  const flowNodes: Node[] = [];

  for (const fp of folderPaths) {
    const expanded = opts.visibility.expandedFolders.has(fp);
    const st = folderStats(fp, folderPaths, allFilePaths);
    flowNodes.push({
      id: `folder:${fp}`,
      type: "folderNode",
      position: { x: 0, y: 0 },
      data: {
        path: fp,
        label: folderDisplayName(fp),
        expanded,
        directFileCount: st.files,
        subfolderCount: st.subfolders,
        onToggle: () => opts.callbacks.onToggleFolder(fp),
      },
    });
  }

  for (const n of fileNodes) {
    const fpNorm = normPath(n.filePath);
    const canLoadFns =
      opts.visibility.showFunctions &&
      !opts.visibility.expandedFunctionFiles.has(fpNorm);
    flowNodes.push({
      id: n.id,
      type: "fileNode",
      position: { x: 0, y: 0 },
      data: {
        ...n,
        functionsExpanded: opts.visibility.expandedFunctionFiles.has(fpNorm),
        onExpandFunctions: canLoadFns
          ? () => opts.callbacks.onExpandFileFunctions(fpNorm)
          : undefined,
      },
    });
  }

  for (const n of funcNodes) {
    flowNodes.push({
      id: n.id,
      type: "functionNode",
      position: { x: 0, y: 0 },
      data: n as unknown as Record<string, unknown>,
    });
  }

  const needsRoot: string[] = [];
  for (const fp of folderPaths) {
    if (!fp.includes("/")) {
      needsRoot.push(`folder:${fp}`);
    }
  }
  for (const n of fileNodes) {
    if (!dirnameOf(n.filePath)) {
      needsRoot.push(n.id);
    }
  }

  if (opts.useLayoutRoot && needsRoot.length > 0) {
    flowNodes.push({
      id: LAYOUT_ROOT_ID,
      type: "layoutRoot",
      position: { x: 0, y: 0 },
      data: {},
      draggable: false,
      selectable: false,
      focusable: false,
    });
    for (const id of needsRoot) {
      layoutEdgeList.push({
        id: `layout-root:${id}`,
        source: LAYOUT_ROOT_ID,
        target: id,
      });
    }
  }

  const positioned = applyDagreLayout(flowNodes, layoutEdgeList, {
    rankdir: "LR",
  });

  const nodesOut = positioned.filter((n) => n.id !== LAYOUT_ROOT_ID);

  const displayEdges: Edge[] = vizEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    ...edgeVisuals(e.kind, {}),
  }));

  return { nodes: nodesOut, edges: displayEdges };
}
