"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo } from "react";

export type FolderNodeData = {
  path: string;
  label: string;
  expanded: boolean;
  directFileCount: number;
  subfolderCount: number;
  onToggle: () => void;
};

function FolderFlowNodeInner(props: NodeProps) {
  const d = props.data as unknown as FolderNodeData;
  const { selected } = props;
  const summary = `${d.directFileCount} files · ${d.subfolderCount} subfolders`;

  return (
    <div
      className={`w-[156px] cursor-pointer rounded-lg border border-zinc-600/60 bg-zinc-900/95 px-2.5 py-2 shadow-lg ring-1 ring-zinc-700/50 transition-all duration-200 hover:border-zinc-500 hover:ring-zinc-600 ${
        selected ? "ring-2 ring-sky-500/70" : ""
      }`}
      onClick={() => {
        d.onToggle();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          d.onToggle();
        }
      }}
      role="button"
      tabIndex={0}
      title={`${d.path} — ${summary}. Click to ${d.expanded ? "collapse" : "expand"}.`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-1.5 !w-1.5 !border-0 !bg-zinc-500"
      />
      <div className="flex items-center gap-2">
        <span className="text-sm leading-none text-zinc-400">
          {d.expanded ? "▼" : "▶"}
        </span>
        <div className="min-w-0 flex-1 text-left">
          <div className="text-[8px] font-bold uppercase tracking-wider text-zinc-500">
            Folder
          </div>
          <div className="truncate font-mono text-[11px] font-semibold text-zinc-100">
            {d.label}
          </div>
        </div>
      </div>
      <div className="mt-1 text-[9px] text-zinc-500">{summary}</div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-1.5 !w-1.5 !border-0 !bg-zinc-500"
      />
    </div>
  );
}

export const FolderFlowNode = memo(FolderFlowNodeInner);
