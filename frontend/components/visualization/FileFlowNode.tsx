"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo, useMemo } from "react";
import type { VizGraphNode } from "@/types/api";

type FileNodeData = VizGraphNode & {
  onExpandFunctions?: () => void;
  functionsExpanded?: boolean;
};

function severityLevel(d: VizGraphNode): "clean" | "medium" | "critical" {
  const issues = (d.smellCount ?? 0) + (d.ai?.issueCount ?? 0);
  if (
    d.complexityTier === "high" ||
    issues >= 5 ||
    d.ai?.severityTag === "error"
  ) {
    return "critical";
  }
  if (
    d.complexityTier === "medium" ||
    issues >= 1 ||
    d.ai?.severityTag === "warning"
  ) {
    return "medium";
  }
  return "clean";
}

const severityRing: Record<string, string> = {
  clean: "ring-emerald-500/80 bg-emerald-500/10 border-emerald-600/40",
  medium: "ring-amber-500/80 bg-amber-500/12 border-amber-600/50",
  critical: "ring-red-600/90 bg-red-500/15 border-red-600/60",
};

function FileFlowNodeInner(props: NodeProps) {
  const d = props.data as unknown as FileNodeData;
  const { selected } = props;
  const sev = severityLevel(d);
  const ring = severityRing[sev] ?? severityRing.clean;
  const issueTotal =
    (d.smellCount ?? 0) + (d.ai?.issueCount ?? 0);

  const title = useMemo(() => {
    const parts = [
      d.filePath,
      `Issues: ${issueTotal}`,
      d.complexityTier
        ? `Complexity tier: ${d.complexityTier}`
        : undefined,
      d.maxCyclomatic != null ? `Max cyclomatic: ${d.maxCyclomatic}` : undefined,
    ].filter(Boolean);
    return parts.join("\n");
  }, [d.filePath, d.complexityTier, d.maxCyclomatic, issueTotal]);

  return (
    <div
      title={title}
      className={`min-w-[160px] max-w-[220px] rounded-lg border px-3 py-2 shadow-sm ring-2 dark:border-slate-600 ${ring} ${
        selected ? "outline outline-2 outline-blue-500" : ""
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-400" />
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            File · {d.complexityTier ?? "low"}
          </div>
          <div className="truncate font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
            {d.label}
          </div>
        </div>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
            sev === "critical"
              ? "bg-red-600 text-white"
              : sev === "medium"
                ? "bg-amber-500 text-slate-900"
                : "bg-emerald-600/90 text-white"
          }`}
        >
          {issueTotal}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-600 dark:text-slate-300">
        {d.maxCyclomatic != null && <span>cc≤{d.maxCyclomatic}</span>}
        {(d.smellCount ?? 0) > 0 && (
          <span className="rounded bg-amber-200/80 px-1 dark:bg-amber-900/50">
            {d.smellCount} smells
          </span>
        )}
        {d.ai && d.ai.issueCount > 0 && (
          <span className="rounded bg-violet-200/80 px-1 dark:bg-violet-900/50">
            {d.ai.issueCount} AI
          </span>
        )}
        {d.onExpandFunctions && !d.functionsExpanded && (
          <button
            type="button"
            className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-medium text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
            onClick={(e) => {
              e.stopPropagation();
              d.onExpandFunctions?.();
            }}
          >
            + functions
          </button>
        )}
      </div>
      {d.ai?.explanationPreview && (
        <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-slate-600 dark:text-slate-400">
          {d.ai.explanationPreview}
        </p>
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-slate-400"
      />
    </div>
  );
}

export const FileFlowNode = memo(FileFlowNodeInner);
