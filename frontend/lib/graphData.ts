import type { VizGraphData, VizGraphEdge, VizGraphNode } from "@/types/api";

/** Ensures the bundle always has arrays the graph can render (older APIs / partial JSON). */
export function coerceVizGraphData(raw: unknown): VizGraphData {
  if (!raw || typeof raw !== "object") {
    return { nodes: [], edges: [] };
  }
  const o = raw as Record<string, unknown>;
  const nodes = Array.isArray(o.nodes) ? (o.nodes as VizGraphNode[]) : [];
  const edges = Array.isArray(o.edges) ? (o.edges as VizGraphEdge[]) : [];
  return { nodes, edges };
}
