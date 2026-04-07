"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo, useMemo } from "react";
import type { VizGraphNode } from "@/types/api";

type FileNodeData = VizGraphNode & {
  detailExpanded?: boolean;
  hasDetailChildren?: boolean;
  onToggleFileExpand?: () => void;
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

const severityStyle: Record<string, string> = {
  clean: "border-emerald-700/50 bg-emerald-950/30 ring-emerald-800/40",
  medium: "border-amber-600/50 bg-amber-950/25 ring-amber-800/40",
  critical: "border-red-600/60 bg-red-950/35 ring-red-800/50",
};

function FileFlowNodeInner(props: NodeProps) {
  const d = props.data as unknown as FileNodeData;
  const { selected } = props;
  const sev = severityLevel(d);
  const ring = severityStyle[sev] ?? severityStyle.clean;
  const issueTotal = (d.smellCount ?? 0) + (d.ai?.issueCount ?? 0);

  const title = useMemo(() => {
    const parts = [
      d.filePath,
      `Issues: ${issueTotal}`,
      d.complexityTier
        ? `Complexity: ${d.complexityTier}`
        : undefined,
      d.maxCyclomatic != null ? `Max cc: ${d.maxCyclomatic}` : undefined,
    ].filter(Boolean);
    return parts.join("\n");
  }, [d.filePath, d.complexityTier, d.maxCyclomatic, issueTotal]);

  const canToggle = Boolean(d.onToggleFileExpand && d.hasDetailChildren);

  return (
    <div
      title={title}
      className={`w-[172px] rounded-lg border px-2.5 py-2 shadow-lg ring-1 transition-all duration-200 hover:brightness-110 ${ring} ${
        selected ? "ring-2 ring-sky-500/80" : ""
      }`}
      onClick={() => {
        if (canToggle) {
          d.onToggleFileExpand?.();
        }
      }}
      onKeyDown={(e) => {
        if (canToggle && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          d.onToggleFileExpand?.();
        }
      }}
      role={canToggle ? "button" : undefined}
      tabIndex={canToggle ? 0 : undefined}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-1.5 !w-1.5 !border-0 !bg-zinc-500"
      />
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          {canToggle && (
            <span className="mr-1 inline text-[10px] text-zinc-500">
              {d.detailExpanded ? "▼" : "▶"}
            </span>
          )}
          <span className="truncate font-mono text-[11px] font-semibold text-zinc-100">
            {d.label}
          </span>
        </div>
        <span
          className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold tabular-nums ${
            sev === "critical"
              ? "bg-red-600 text-white"
              : sev === "medium"
                ? "bg-amber-500 text-zinc-900"
                : "bg-emerald-600 text-white"
          }`}
        >
          {issueTotal}
        </span>
      </div>
      <div className="mt-0.5 text-[9px] text-zinc-500">
        {d.complexityTier ?? "low"} tier
        {d.maxCyclomatic != null ? ` · cc≤${d.maxCyclomatic}` : ""}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-1.5 !w-1.5 !border-0 !bg-zinc-500"
      />
    </div>
  );
}

export const FileFlowNode = memo(FileFlowNodeInner);
