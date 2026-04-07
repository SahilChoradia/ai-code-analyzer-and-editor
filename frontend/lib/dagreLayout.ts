import dagre from "dagre";
import type { Edge, Node } from "@xyflow/react";

const NODE_DIM: Record<string, { w: number; h: number }> = {
  folderNode: { w: 200, h: 52 },
  fileNode: { w: 200, h: 112 },
  functionNode: { w: 128, h: 56 },
  layoutRoot: { w: 4, h: 4 },
};

export type DagreEdge = { id: string; source: string; target: string };

/**
 * Apply dagre layout. Nodes must have `id` and `type` set.
 * Returns new nodes with `position` set (top-left).
 */
export function applyDagreLayout(
  nodes: Node[],
  layoutEdges: DagreEdge[],
  options?: { rankdir?: "TB" | "LR" | "BT" | "RL" },
): Node[] {
  if (nodes.length === 0) {
    return [];
  }

  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: options?.rankdir ?? "LR",
    nodesep: 48,
    ranksep: 72,
    marginx: 24,
    marginy: 24,
  });

  for (const n of nodes) {
    const dim = NODE_DIM[n.type as string] ?? NODE_DIM.fileNode;
    g.setNode(n.id, { width: dim.w, height: dim.h });
  }

  for (const e of layoutEdges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  return nodes.map((n) => {
    const dim = NODE_DIM[n.type as string] ?? NODE_DIM.fileNode;
    const nodeWithPosition = g.node(n.id);
    if (!nodeWithPosition) {
      return { ...n, position: n.position ?? { x: 0, y: 0 } };
    }
    const x = nodeWithPosition.x - dim.w / 2;
    const y = nodeWithPosition.y - dim.h / 2;
    return {
      ...n,
      position: { x, y },
    };
  });
}
