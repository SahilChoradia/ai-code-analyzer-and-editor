"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import type { VizGraphNode } from "@/types/api";

function FunctionFlowNodeInner(props: NodeProps) {
  const d = props.data as unknown as VizGraphNode;
  const { selected } = props;
  const cc = d.cyclomaticComplexity ?? 0;
  const hot = cc >= 10;

  const title = `${d.functionName ?? d.label}() · cyclomatic ${cc}`;

  return (
    <div
      title={title}
      className={`rounded-md border px-2 py-1 text-left shadow-sm dark:border-slate-600 ${
        hot
          ? "border-orange-400 bg-orange-50 dark:bg-orange-950/40"
          : "border-slate-200 bg-white dark:bg-slate-900/80"
      } ${selected ? "outline outline-2 outline-blue-500" : ""}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !bg-slate-400"
      />
      <div className="font-mono text-[11px] font-medium text-slate-800 dark:text-slate-200">
        {d.label}()
      </div>
      <div className="text-[9px] text-slate-500">cc {cc}</div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !bg-slate-400"
      />
    </div>
  );
}

export const FunctionFlowNode = memo(FunctionFlowNodeInner);
