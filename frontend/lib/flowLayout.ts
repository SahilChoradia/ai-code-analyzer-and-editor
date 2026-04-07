import type { Edge, Node } from "@xyflow/react";
import type { VizGraphData, VizGraphEdge, VizGraphNode } from "@/types/api";
import { applyDagreLayout, type DagreEdge } from "@/lib/dagreLayout";
import type { IssueChildDef } from "@/lib/graphIssueChildren";
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

const LAYOUT_ROOT_ID = "layout-root";

function dirnameOf(path: string): string {
  const n = normPath(path);
  const i = n.lastIndexOf("/");
  if (i <= 0) {
    return "";
  }
  return n.slice(0, i);
}

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

export type FlowCallbacks = {
  onToggleFolder: (folderPath: string) => void;
  onToggleFileExpand: (filePath: string) => void;
};

export type BuildFlowOptions = {
  visibility: VisibilityOptions;
  callbacks: FlowCallbacks;
  useLayoutRoot: boolean;
  issueChildrenByFile: Map<string, IssueChildDef[]>;
};

function toFlowEdge(
  e: Pick<VizGraphEdge, "id" | "source" | "target">,
  stroke: string,
): Edge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    type: "graphFade",
    style: { stroke },
    data: {},
  };
}

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

  const displayEdges: Edge[] = vizEdges.map((e) =>
    toFlowEdge(
      e,
      e.kind === "import"
        ? "#a1a1aa"
        : e.kind === "call"
          ? "#d97706"
          : "#71717a",
    ),
  );

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
    const expanded = opts.visibility.expandedFiles.has(fpNorm);
    const issueKids = opts.issueChildrenByFile.get(fpNorm) ?? [];
    const hasChildren =
      issueKids.length > 0 ||
      graphData.nodes.some(
        (x) =>
          x.kind === "function" && normPath(x.filePath) === fpNorm,
      );

    flowNodes.push({
      id: n.id,
      type: "fileNode",
      position: { x: 0, y: 0 },
      data: {
        ...n,
        detailExpanded: expanded,
        hasDetailChildren: hasChildren,
        onToggleFileExpand: hasChildren
          ? () => opts.callbacks.onToggleFileExpand(fpNorm)
          : undefined,
      },
    });

    if (expanded) {
      for (const iss of issueKids) {
        flowNodes.push({
          id: iss.id,
          type: "issueNode",
          position: { x: 0, y: 0 },
          data: {
            label: iss.label,
            severity: iss.severity,
            source: iss.source,
          },
        });
        const layoutId = `layout:issue:${iss.id}`;
        layoutEdgeList.push({
          id: layoutId,
          source: n.id,
          target: iss.id,
        });
        displayEdges.push(
          toFlowEdge(
            { id: `contains:${iss.id}`, source: n.id, target: iss.id },
            "#52525b",
          ),
        );
      }
    }
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
    rankdir: "TB",
  });

  const nodesOut = positioned.filter((n) => n.id !== LAYOUT_ROOT_ID);

  return { nodes: nodesOut, edges: displayEdges };
}
