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
  const summary = `${d.directFileCount} file(s), ${d.subfolderCount} subfolder(s)`;

  return (
    <div
      className={`min-w-[180px] max-w-[240px] cursor-pointer rounded-lg border border-indigo-300 bg-indigo-50/90 px-3 py-2 shadow-sm ring-1 ring-indigo-400/30 dark:border-indigo-600 dark:bg-indigo-950/50 dark:ring-indigo-500/30 ${
        selected ? "outline outline-2 outline-blue-500" : ""
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
        position={Position.Left}
        className="!h-2 !w-2 !bg-indigo-400"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg leading-none text-indigo-700 dark:text-indigo-300">
          {d.expanded ? "▼" : "▶"}
        </span>
        <div className="min-w-0 flex-1 text-left">
          <div className="text-[10px] font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
            Folder
          </div>
          <div className="truncate font-mono text-xs font-semibold text-indigo-950 dark:text-indigo-100">
            {d.label}
          </div>
        </div>
      </div>
      <div className="mt-1 text-[10px] text-indigo-800/80 dark:text-indigo-200/80">
        {summary}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !bg-indigo-400"
      />
    </div>
  );
}

export const FolderFlowNode = memo(FolderFlowNodeInner);
