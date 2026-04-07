"use client";

import { useMemo, useState } from "react";
import type { ProjectFile } from "@/types/api";

type TreeNode = {
  name: string;
  path: string | null;
  children: TreeNode[];
};

function buildTree(files: ProjectFile[]): TreeNode {
  const root: TreeNode = { name: "", path: null, children: [] };

  for (const f of files) {
    const parts = f.path.replace(/\\/g, "/").split("/").filter(Boolean);
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isFile = i === parts.length - 1;
      let next = cur.children.find((c) => c.name === part);
      if (!next) {
        next = {
          name: part,
          path: isFile ? f.path.replace(/\\/g, "/") : null,
          children: [],
        };
        cur.children.push(next);
      }
      cur = next;
    }
  }

  function sortNodes(n: TreeNode): void {
    n.children.sort((a, b) => {
      const aDir = a.children.length > 0 || a.path === null ? 0 : 1;
      const bDir = b.children.length > 0 || b.path === null ? 0 : 1;
      if (aDir !== bDir) {
        return aDir - bDir;
      }
      return a.name.localeCompare(b.name);
    });
    n.children.forEach(sortNodes);
  }
  sortNodes(root);
  return root;
}

function TreeRow({
  node,
  depth,
  selectedPath,
  onSelectFile,
  defaultOpen,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (!node.name && node.children.length === 0) {
    return null;
  }

  const isFolder = node.path === null && node.children.length > 0;
  const isSelectable = node.path !== null;

  if (!node.name) {
    return (
      <>
        {node.children.map((c) => (
          <TreeRow
            key={c.name + (c.path ?? "dir")}
            node={c}
            depth={depth}
            selectedPath={selectedPath}
            onSelectFile={onSelectFile}
            defaultOpen={defaultOpen}
          />
        ))}
      </>
    );
  }

  return (
    <div className="select-none">
      <div
        className={`flex items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] ${
          isSelectable && selectedPath === node.path
            ? "bg-blue-100 font-medium text-blue-900 dark:bg-blue-950/60 dark:text-blue-100"
            : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        }`}
        style={{ paddingLeft: 4 + depth * 10 }}
      >
        {isFolder ? (
          <button
            type="button"
            className="w-4 shrink-0 text-slate-500"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "▼" : "▶"}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        {isSelectable ? (
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left font-mono"
            onClick={() => node.path && onSelectFile(node.path)}
          >
            {node.name}
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate font-mono text-slate-600 dark:text-slate-400">
            {node.name}
          </span>
        )}
      </div>
      {isFolder && open && (
        <div>
          {node.children.map((c) => (
            <TreeRow
              key={c.name + (c.path ?? "dir")}
              node={c}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
              defaultOpen={depth < 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type Props = {
  files: ProjectFile[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
};

export function FixFileTree({ files, selectedPath, onSelectFile }: Props) {
  const tree = useMemo(() => buildTree(files), [files]);

  return (
    <div className="max-h-[min(55vh,480px)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900/40">
      {files.length === 0 ? (
        <p className="p-2 text-xs text-slate-500">No files in project.</p>
      ) : (
        <TreeRow
          node={tree}
          depth={0}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          defaultOpen
        />
      )}
    </div>
  );
}
