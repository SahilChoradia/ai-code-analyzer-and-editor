"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import type { AiFileInsight, VizGraphData, VizGraphNode } from "@/types/api";
import {
  collectFolderPaths,
  normPath,
} from "@/lib/graphVisibility";
import {
  filterVisualizationGraph,
  toFlowElements,
  type VisibilityOptions,
} from "@/lib/flowLayout";
import { FileFlowNode } from "./FileFlowNode";
import { FolderFlowNode } from "./FolderFlowNode";
import { FunctionFlowNode } from "./FunctionFlowNode";

const nodeTypes = {
  fileNode: FileFlowNode,
  functionNode: FunctionFlowNode,
  folderNode: FolderFlowNode,
};

function parseFunctionNodeId(
  id: string,
): { filePath: string; name: string } | null {
  if (!id.startsWith("func:")) {
    return null;
  }
  const rest = id.slice(5);
  const hash = rest.lastIndexOf("#");
  if (hash <= 0) {
    return null;
  }
  return {
    filePath: rest.slice(0, hash),
    name: decodeURIComponent(rest.slice(hash + 1)),
  };
}

function filePathFromFileNodeId(id: string): string | null {
  if (!id.startsWith("file:")) {
    return null;
  }
  return id.slice(5);
}

function findAiInsight(
  path: string,
  insights: AiFileInsight[],
): AiFileInsight | undefined {
  const n = normPath(path);
  return insights.find((i) => normPath(i.filePath) === n);
}

type Props = {
  graphData: VizGraphData;
  aiInsights: AiFileInsight[];
};

/** React Flow measures nodes after paint; fitView on prop alone often runs too early (blank pane). */
function FitViewAfterLayout({ structureKey }: { structureKey: string }) {
  const { fitView } = useReactFlow();
  useLayoutEffect(() => {
    if (!structureKey) {
      return;
    }
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) {
          fitView({ padding: 0.15, duration: 200 });
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [structureKey, fitView]);
  return null;
}

function toggleFolderInSet(
  path: string,
  prev: Set<string>,
): Set<string> {
  const next = new Set(prev);
  if (next.has(path)) {
    next.delete(path);
    for (const k of [...next]) {
      if (k.startsWith(`${path}/`)) {
        next.delete(k);
      }
    }
  } else {
    next.add(path);
  }
  return next;
}

function autoExpandForPrefix(prefix: string | null): Set<string> {
  if (prefix == null || prefix === "") {
    return new Set();
  }
  const parts = normPath(prefix).split("/").filter(Boolean);
  const s = new Set<string>();
  let acc = "";
  for (let i = 0; i < parts.length; i++) {
    acc = i === 0 ? parts[i]! : `${acc}/${parts[i]}`;
    s.add(acc);
  }
  return s;
}

function GraphInner({ graphData, aiInsights }: Props) {
  const [highOnly, setHighOnly] = useState(false);
  const [probOnly, setProbOnly] = useState(false);
  const [folderFilterPrefix, setFolderFilterPrefix] = useState<string | null>(
    null,
  );
  const [directImportsOnly, setDirectImportsOnly] = useState(true);
  const [showFunctions, setShowFunctions] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedFunctionFiles, setExpandedFunctionFiles] = useState<
    Set<string>
  >(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterVisualizationGraph(graphData, highOnly, probOnly),
    [graphData, highOnly, probOnly],
  );

  const folderChoices = useMemo(() => {
    const paths = filtered.nodes
      .filter((n) => n.kind === "file")
      .map((n) => normPath(n.filePath));
    return [...collectFolderPaths(paths)].sort();
  }, [filtered.nodes]);

  const autoExpand = useMemo(
    () => autoExpandForPrefix(folderFilterPrefix),
    [folderFilterPrefix],
  );

  const effectiveExpandedFolders = useMemo(() => {
    const m = new Set<string>([...expandedFolders, ...autoExpand]);
    return m;
  }, [expandedFolders, autoExpand]);

  const onToggleFolder = useCallback((folderPath: string) => {
    setExpandedFolders((prev) => toggleFolderInSet(folderPath, prev));
  }, []);

  const onExpandFileFunctions = useCallback((filePath: string) => {
    const p = normPath(filePath);
    setExpandedFunctionFiles((prev) => new Set(prev).add(p));
  }, []);

  const visibility: VisibilityOptions = useMemo(
    () => ({
      expandedFolders: effectiveExpandedFolders,
      showFunctions,
      expandedFunctionFiles,
      directImportsOnly,
      folderPrefix: folderFilterPrefix,
    }),
    [
      effectiveExpandedFolders,
      showFunctions,
      expandedFunctionFiles,
      directImportsOnly,
      folderFilterPrefix,
    ],
  );

  const flowCallbacks = useMemo(
    () => ({
      onToggleFolder,
      onExpandFileFunctions,
    }),
    [onToggleFolder, onExpandFileFunctions],
  );

  const structureKey = useMemo(() => {
    const parts = [
      [...filtered.nodes].map((n) => n.id).sort().join("\0"),
      [...effectiveExpandedFolders].sort().join("/"),
      folderFilterPrefix ?? "",
      String(directImportsOnly),
      String(showFunctions),
      [...expandedFunctionFiles].sort().join(","),
    ];
    return parts.join("|");
  }, [
    filtered.nodes,
    effectiveExpandedFolders,
    folderFilterPrefix,
    directImportsOnly,
    showFunctions,
    expandedFunctionFiles,
  ]);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () =>
      toFlowElements(filtered, {
        visibility,
        callbacks: flowCallbacks,
        useLayoutRoot: true,
      }),
    [filtered, visibility, flowCallbacks],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    const next = toFlowElements(filtered, {
      visibility,
      callbacks: flowCallbacks,
      useLayoutRoot: true,
    });
    setNodes(next.nodes);
    setEdges(next.edges);
    setSelectedId(null);
  }, [filtered, visibility, flowCallbacks, setNodes, setEdges]);

  const onNodeClick = useCallback((_: MouseEvent, node: Node) => {
    setSelectedId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedId(null);
  }, []);

  const selectedViz: VizGraphNode | undefined = useMemo(() => {
    if (!selectedId) {
      return undefined;
    }
    if (selectedId.startsWith("folder:")) {
      return undefined;
    }
    return graphData.nodes.find((n) => n.id === selectedId);
  }, [selectedId, graphData.nodes]);

  const selectedFolderPath = useMemo(() => {
    if (!selectedId?.startsWith("folder:")) {
      return null;
    }
    return selectedId.slice("folder:".length);
  }, [selectedId]);

  const detailAi = useMemo(() => {
    if (!selectedId) {
      return undefined;
    }
    if (selectedId.startsWith("file:")) {
      const p = filePathFromFileNodeId(selectedId);
      return p ? findAiInsight(p, aiInsights) : undefined;
    }
    const fn = parseFunctionNodeId(selectedId);
    return fn ? findAiInsight(fn.filePath, aiInsights) : undefined;
  }, [selectedId, aiInsights]);

  if (graphData.nodes.length === 0) {
    return (
      <div className="flex h-[480px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
        Run analysis to build the dependency graph, function nodes, and call
        hints.
      </div>
    );
  }

  if (filtered.nodes.length === 0) {
    return (
      <div className="flex h-[480px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-6 text-center text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-100">
        <p>No nodes match the current filters.</p>
        <button
          type="button"
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500"
          onClick={() => {
            setHighOnly(false);
            setProbOnly(false);
          }}
        >
          Clear filters
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[480px] flex-col gap-3 lg:h-[min(70vh,720px)] lg:flex-row lg:min-h-[520px]">
      <div className="relative h-[min(70vh,720px)] min-h-[480px] w-full shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950 lg:h-full lg:min-h-0 lg:flex-1">
        <ReactFlow
          className="h-full w-full"
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          minZoom={0.08}
          maxZoom={2}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elevateEdgesOnSelect
          onlyRenderVisibleElements
        >
          <FitViewAfterLayout structureKey={structureKey} />
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            zoomable
            pannable
            className="!bg-white/90 dark:!bg-slate-900/90"
          />
          <Panel
            position="top-left"
            className="m-2 flex max-h-[min(70vh,520px)] max-w-[min(100%,300px)] flex-col gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-white/95 p-2.5 text-xs shadow dark:border-slate-600 dark:bg-slate-900/95"
          >
            <span className="font-semibold text-slate-800 dark:text-slate-100">
              Graph controls
            </span>
            <label className="flex cursor-pointer items-center gap-2 text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={highOnly}
                onChange={(e) => setHighOnly(e.target.checked)}
              />
              High complexity files only
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={probOnly}
                onChange={(e) => setProbOnly(e.target.checked)}
              />
              Files with issues (smells, AI, or not low tier)
            </label>
            <div className="space-y-1 border-t border-slate-200 pt-2 dark:border-slate-600">
              <div className="text-[10px] font-medium uppercase text-slate-500 dark:text-slate-400">
                Folder scope
              </div>
              <select
                className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={folderFilterPrefix ?? ""}
                onChange={(e) =>
                  setFolderFilterPrefix(e.target.value || null)
                }
              >
                <option value="">All folders</option>
                {folderChoices.map((fp) => (
                  <option key={fp} value={fp}>
                    {fp}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={directImportsOnly}
                onChange={(e) => setDirectImportsOnly(e.target.checked)}
              />
              Direct imports only (hide calls / contains)
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={showFunctions}
                onChange={(e) => {
                  setShowFunctions(e.target.checked);
                  if (!e.target.checked) {
                    setExpandedFunctionFiles(new Set());
                  }
                }}
              />
              Allow function nodes (load per file with + functions)
            </label>
            <p className="text-[10px] leading-snug text-slate-500 dark:text-slate-400">
              Folders start collapsed — click a folder node to reveal files.
              Pick a folder above to focus that subtree.
            </p>
            <div className="border-t border-slate-200 pt-2 text-[10px] text-slate-500 dark:border-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <span className="h-0.5 w-4 bg-blue-600" /> imports
              </div>
              <div className="flex items-center gap-2">
                <span className="h-0.5 w-4 bg-orange-600" /> calls (same file)
              </div>
              <div className="flex items-center gap-2">
                <span className="h-0.5 w-4 border-t-2 border-dashed border-slate-400" />{" "}
                file → function
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm bg-indigo-400/80" /> folder
              </div>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      <aside className="w-full shrink-0 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/60 lg:w-80">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Node details
        </h3>
        {!selectedId && (
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Click a folder, file, or function node. Hover for a quick summary.
            Use the mouse wheel to zoom and drag the pane to pan.
          </p>
        )}
        {selectedFolderPath && (
          <div className="mt-3 space-y-2">
            <div className="text-[10px] uppercase text-slate-500">Folder</div>
            <div className="break-all font-mono text-sm font-semibold text-indigo-900 dark:text-indigo-200">
              {selectedFolderPath}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Use the folder node on the canvas to expand or collapse this
              branch. Narrow the graph with &quot;Folder scope&quot; in the
              panel.
            </p>
          </div>
        )}
        {selectedViz && (
          <div className="mt-3 space-y-3">
            <div>
              <div className="text-[10px] uppercase text-slate-500">
                {selectedViz.kind}
              </div>
              <div className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                {selectedViz.kind === "file"
                  ? selectedViz.filePath
                  : `${selectedViz.filePath} · ${selectedViz.functionName}`}
              </div>
            </div>
            {selectedViz.kind === "file" && (
              <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                <li>
                  Complexity tier:{" "}
                  <strong>{selectedViz.complexityTier ?? "—"}</strong>
                </li>
                <li>Max cyclomatic: {selectedViz.maxCyclomatic ?? "—"}</li>
                <li>
                  Issues (smells + AI):{" "}
                  {(selectedViz.smellCount ?? 0) +
                    (selectedViz.ai?.issueCount ?? 0)}
                </li>
              </ul>
            )}
            {selectedViz.kind === "function" && (
              <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                <li>
                  Cyclomatic complexity:{" "}
                  <strong>{selectedViz.cyclomaticComplexity ?? "—"}</strong>
                </li>
              </ul>
            )}
            {detailAi ? (
              <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-600">
                <div className="text-xs font-semibold text-violet-800 dark:text-violet-300">
                  Gemini · full insight
                </div>
                <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                  {detailAi.explanation}
                </p>
                {detailAi.issues.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold uppercase text-amber-800 dark:text-amber-300">
                      Issues
                    </div>
                    <ul className="mt-1 list-inside list-disc text-xs text-slate-700 dark:text-slate-300">
                      {detailAi.issues.map((t, i) => (
                        <li key={`iss-${i}`}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {detailAi.suggestions.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold uppercase text-blue-800 dark:text-blue-300">
                      Refactors
                    </div>
                    <ul className="mt-1 list-inside list-disc text-xs text-slate-700 dark:text-slate-300">
                      {detailAi.suggestions.map((t, i) => (
                        <li key={`sug-${i}`}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              selectedViz.kind !== "function" && (
                <p className="border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-600 dark:text-slate-400">
                  No Gemini insight for this file (run analyze with
                  GEMINI_API_KEY, or file was outside the AI batch).
                </p>
              )
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

export function AnalysisGraphView(props: Props) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  );
}
