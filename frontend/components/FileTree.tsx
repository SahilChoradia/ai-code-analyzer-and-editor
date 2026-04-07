"use client";

import type { ProjectFile } from "@/types/api";
import { useMemo, type ReactNode } from "react";

export type FileTreeNode = {
  name: string;
  path: string;
  isFile: boolean;
  language?: string;
  size?: number;
  children: FileTreeNode[];
};

function buildFileTree(files: ProjectFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  function insert(
    parts: string[],
    pathPrefix: string[],
    file: ProjectFile,
    level: FileTreeNode[],
  ): void {
    if (parts.length === 0) {
      return;
    }
    const head = parts[0];
    const rest = parts.slice(1);
    const nextPrefix = [...pathPrefix, head];
    const pathStr = nextPrefix.join("/");
    const isLeaf = rest.length === 0;

    let child = level.find((n) => n.name === head);
    if (!child) {
      child = {
        name: head,
        path: pathStr,
        isFile: isLeaf,
        language: isLeaf ? file.language : undefined,
        size: isLeaf ? file.size : undefined,
        children: [],
      };
      level.push(child);
    } else if (isLeaf) {
      child.isFile = true;
      child.language = file.language;
      child.size = file.size;
      child.path = pathStr;
    } else if (child.isFile) {
      child.isFile = false;
      child.language = undefined;
      child.size = undefined;
    }

    if (rest.length > 0) {
      insert(rest, nextPrefix, file, child.children);
    }
  }

  for (const f of files) {
    const parts = f.path.split("/").filter(Boolean);
    insert(parts, [], f, root);
  }

  function sortTree(nodes: FileTreeNode[]): void {
    nodes.sort((a, b) => {
      if (a.isFile !== b.isFile) {
        return a.isFile ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      sortTree(n.children);
    }
  }
  sortTree(root);
  return root;
}

type Props = {
  files: ProjectFile[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
};

export function FileTree({ files, selectedPath, onSelectFile }: Props) {
  const tree = useMemo(() => buildFileTree(files), [files]);

  if (files.length === 0) {
    return (
      <p className="p-4 text-sm text-slate-500 dark:text-slate-400">
        No files in this project.
      </p>
    );
  }

  function renderNodes(nodes: FileTreeNode[], depth: number): ReactNode {
    return (
      <ul className={depth === 0 ? "space-y-0.5" : "ml-3 mt-0.5 space-y-0.5 border-l border-slate-200 pl-2 dark:border-slate-700"}>
        {nodes.map((node) => (
          <li key={node.path}>
            {node.isFile ? (
              <button
                type="button"
                onClick={() => onSelectFile(node.path)}
                className={[
                  "w-full rounded-md px-2 py-1 text-left text-xs font-mono transition",
                  selectedPath === node.path
                    ? "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                ].join(" ")}
              >
                {node.name}
                <span className="ml-2 text-[10px] uppercase text-slate-400">
                  {node.language}
                </span>
              </button>
            ) : (
              <div>
                <span className="px-2 py-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {node.name}/
                </span>
                {renderNodes(node.children, depth + 1)}
              </div>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="max-h-[calc(100vh-12rem)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900/40">
      {renderNodes(tree, 0)}
    </div>
  );
}
