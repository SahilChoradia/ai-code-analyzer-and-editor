import type { IAiFileInsight } from "../../models/project.model.js";
import type { SerializedAstNode } from "../../utils/astSerializer.js";
import { extractIntraFileCalls } from "../analysis/callExtractor.js";
import type {
  CodeSmell,
  FileAnalysisResult,
  ProjectAnalysisPayload,
} from "../analysis/types.js";

/** Optimized graph for React Flow (positions are applied on the client). */
export interface VizGraphNode {
  id: string;
  kind: "file" | "function";
  label: string;
  filePath: string;
  /** Present for functions */
  functionName?: string;
  complexityTier?: "low" | "medium" | "high";
  maxCyclomatic?: number;
  smellCount?: number;
  /** Function cyclomatic complexity */
  cyclomaticComplexity?: number;
  ai?: {
    issueCount: number;
    suggestionCount: number;
    explanationPreview: string;
    severityTag: "none" | "info" | "warning" | "error";
  };
}

export interface VizGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: "import" | "call" | "contains";
}

export interface VizGraphData {
  nodes: VizGraphNode[];
  edges: VizGraphEdge[];
}

export interface ComplexityMetricRow {
  path: string;
  maxCyclomatic: number;
  avgCyclomatic: number;
  functionCount: number;
  smellCount: number;
  tier: "low" | "medium" | "high";
  hasErrorSmell: boolean;
}

function normPath(p: string): string {
  return p.replace(/\\/g, "/");
}

function fileId(path: string): string {
  return `file:${normPath(path)}`;
}

function funcId(path: string, name: string): string {
  return `func:${normPath(path)}#${encodeURIComponent(name)}`;
}

function fileTier(
  maxCc: number,
  smells: CodeSmell[],
  warnThreshold: number,
  errorThreshold: number,
): "low" | "medium" | "high" {
  const hasErr = smells.some((s) => s.severity === "error");
  const hasWarn = smells.some((s) => s.severity === "warning");
  if (hasErr || maxCc >= errorThreshold) {
    return "high";
  }
  if (hasWarn || maxCc >= warnThreshold) {
    return "medium";
  }
  return "low";
}

function aiForPath(
  path: string,
  insights: IAiFileInsight[] | undefined,
):
  | {
      issueCount: number;
      suggestionCount: number;
      explanationPreview: string;
      severityTag: "none" | "info" | "warning" | "error";
    }
  | undefined {
  if (!insights?.length) {
    return undefined;
  }
  const n = normPath(path);
  const hit = insights.find((i) => normPath(i.filePath) === n);
  if (!hit) {
    return undefined;
  }
  const issueCount = hit.issues.length;
  const suggestionCount = hit.suggestions.length;
  let severityTag: "none" | "info" | "warning" | "error" = "none";
  if (issueCount >= 4) {
    severityTag = "error";
  } else if (issueCount >= 1) {
    severityTag = "warning";
  } else if (suggestionCount >= 1) {
    severityTag = "info";
  }
  return {
    issueCount,
    suggestionCount,
    explanationPreview:
      hit.explanation.length > 160
        ? `${hit.explanation.slice(0, 157)}…`
        : hit.explanation,
    severityTag,
  };
}

const MAX_CALL_EDGES = 120;
const MAX_FUNCTIONS_PER_FILE = 40;

/**
 * Builds a compact, frontend-ready graph: file + function nodes, import / contains / call edges.
 */
export function buildVisualizationPayload(
  analysis: ProjectAnalysisPayload | null,
  aiInsights: IAiFileInsight[] | undefined,
  astRows: Array<{ path: string; language: string; ast: SerializedAstNode }>,
  complexityWarn: number,
  complexityError: number,
): { graphData: VizGraphData; complexityMetrics: ComplexityMetricRow[] } {
  if (!analysis) {
    return {
      graphData: { nodes: [], edges: [] },
      complexityMetrics: [],
    };
  }

  const astByPath = new Map(
    astRows.map((r) => [normPath(r.path), r] as const),
  );

  const nodes: VizGraphNode[] = [];
  const edges: VizGraphEdge[] = [];
  const complexityMetrics: ComplexityMetricRow[] = [];

  const fileResults = new Map<string, FileAnalysisResult>();
  for (const f of analysis.files) {
    fileResults.set(normPath(f.path), f);
  }

  let callBudget = MAX_CALL_EDGES;
  let callEdgeSeq = 0;

  for (const f of analysis.files) {
    const p = normPath(f.path);
    const fid = fileId(p);
    const maxCc = f.functions.reduce(
      (m, fn) => Math.max(m, fn.cyclomaticComplexity),
      0,
    );
    const fnCount = f.functions.length;
    const avgCc =
      fnCount > 0
        ? f.functions.reduce((s, fn) => s + fn.cyclomaticComplexity, 0) /
          fnCount
        : 0;
    const tier = fileTier(maxCc, f.smells, complexityWarn, complexityError);

    complexityMetrics.push({
      path: p,
      maxCyclomatic: maxCc,
      avgCyclomatic: Math.round(avgCc * 100) / 100,
      functionCount: fnCount,
      smellCount: f.smells.length,
      tier,
      hasErrorSmell: f.smells.some((s) => s.severity === "error"),
    });

    nodes.push({
      id: fid,
      kind: "file",
      label: p.split("/").pop() || p,
      filePath: p,
      complexityTier: tier,
      maxCyclomatic: maxCc,
      smellCount: f.smells.length,
      ai: aiForPath(p, aiInsights),
    });

    const fnSlice = f.functions.slice(0, MAX_FUNCTIONS_PER_FILE);
    const fnNames = new Set(fnSlice.map((fn) => fn.name));

    for (const fn of fnSlice) {
      const gid = funcId(p, fn.name);
      nodes.push({
        id: gid,
        kind: "function",
        label: fn.name,
        filePath: p,
        functionName: fn.name,
        cyclomaticComplexity: fn.cyclomaticComplexity,
      });
      edges.push({
        id: `contains:${gid}`,
        source: fid,
        target: gid,
        kind: "contains",
      });
    }

    const row = astByPath.get(p);
    if (row && fnNames.size > 0 && callBudget > 0) {
      const calls = extractIntraFileCalls(row.ast, row.language, fnNames);
      for (const c of calls) {
        if (callBudget <= 0) {
          break;
        }
        const fromId = funcId(p, c.fromFunction);
        const toId = funcId(p, c.toFunction);
        if (
          nodes.some((n) => n.id === fromId) &&
          nodes.some((n) => n.id === toId)
        ) {
          edges.push({
            id: `call:${callEdgeSeq++}:${fromId}->${toId}`,
            source: fromId,
            target: toId,
            kind: "call",
          });
          callBudget -= 1;
        }
      }
    }
  }

  let importIdx = 0;
  for (const e of analysis.dependencyGraph.edges) {
    if (e.kind !== "imports") {
      continue;
    }
    const from = normPath(e.from);
    const to = normPath(e.to);
    const sid = fileId(from);
    const tid = fileId(to);
    if (
      fileResults.has(from) &&
      fileResults.has(to)
    ) {
      edges.push({
        id: `import:${importIdx++}:${sid}->${tid}`,
        source: sid,
        target: tid,
        kind: "import",
      });
    }
  }

  return { graphData: { nodes, edges }, complexityMetrics };
}
