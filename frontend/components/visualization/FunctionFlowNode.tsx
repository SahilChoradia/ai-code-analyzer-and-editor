"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import type { VizGraphNode } from "@/types/api";

function FunctionFlowNodeInner(props: NodeProps) {
  const d = props.data as unknown as VizGraphNode;
  const { selected } = props;
  const cc = d.cyclomaticComplexity ?? 0;
  const hot = cc >= 10;

  const title = `${d.functionName ?? d.label}() · cc ${cc}`;

  return (
    <div
      title={title}
      className={`max-w-[110px] rounded-md border px-2 py-1 shadow-md ring-1 transition-all duration-200 ${
        hot
          ? "border-orange-700/50 bg-orange-950/40 ring-orange-900/40"
          : "border-zinc-600/60 bg-zinc-900/90 ring-zinc-800/50"
      } ${selected ? "ring-2 ring-sky-500/80" : ""}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-1.5 !w-1.5 !border-0 !bg-zinc-500"
      />
      <div className="truncate font-mono text-[10px] font-medium text-zinc-200">
        {d.label}()
      </div>
      <div className="text-[8px] text-zinc-500">cc {cc}</div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-1.5 !w-1.5 !border-0 !bg-zinc-500"
      />
    </div>
  );
}

export const FunctionFlowNode = memo(FunctionFlowNodeInner);
