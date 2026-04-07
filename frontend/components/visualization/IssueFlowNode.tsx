"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo } from "react";

export type IssueNodeData = {
  label: string;
  severity: "info" | "warning" | "error";
  source: "static" | "ai";
};

const bar: Record<string, string> = {
  error: "bg-red-500",
  warning: "bg-amber-400",
  info: "bg-zinc-500",
};

function IssueFlowNodeInner(props: NodeProps) {
  const d = props.data as unknown as IssueNodeData;
  const { selected } = props;

  return (
    <div
      className={`max-w-[158px] rounded-md border border-zinc-700/80 bg-zinc-900/90 px-2 py-1.5 shadow-md ring-1 ring-zinc-800 transition-shadow duration-200 ${
        selected ? "ring-2 ring-sky-500/80" : ""
      }`}
      title={d.label}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-1.5 !w-1.5 !border-0 !bg-zinc-500"
      />
      <div className="flex items-start gap-1.5">
        <span
          className={`mt-0.5 h-2 w-0.5 shrink-0 rounded-full ${bar[d.severity] ?? bar.info}`}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[8px] font-semibold uppercase tracking-wide text-zinc-500">
            {d.source === "ai" ? "AI" : "Lint"} · {d.severity}
          </div>
          <div className="line-clamp-2 font-mono text-[10px] leading-snug text-zinc-200">
            {d.label}
          </div>
        </div>
      </div>
    </div>
  );
}

export const IssueFlowNode = memo(IssueFlowNodeInner);
