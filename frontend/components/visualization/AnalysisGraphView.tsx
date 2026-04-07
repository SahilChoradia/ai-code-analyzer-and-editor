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
  type Edge,
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
import type {
  AiFileInsight,
  AnalysisPayload,
  VizGraphData,
  VizGraphNode,
} from "@/types/api";
import { buildIssueChildrenByFile } from "@/lib/graphIssueChildren";
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
import { GraphFadeEdge } from "./GraphFadeEdge";
import { IssueFlowNode } from "./IssueFlowNode";

const nodeTypes = {
  fileNode: FileFlowNode,
  functionNode: FunctionFlowNode,
  folderNode: FolderFlowNode,
  issueNode: IssueFlowNode,
};

const edgeTypes = {
  graphFade: GraphFadeEdge,
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

function dirnameNorm(path: string): string {
  const n = normPath(path);
  const i = n.lastIndexOf("/");
  if (i <= 0) {
    return "";
  }
  return n.slice(0, i);
}

function hierarchyFolderIdsForFilePath(filePath: string): string[] {
  const dir = dirnameNorm(filePath);
  if (!dir) {
    return [];
  }
  const parts = dir.split("/").filter(Boolean);
  const out: string[] = [];
  let acc = "";
  for (let i = 0; i < parts.length; i++) {
    acc = i === 0 ? parts[0]! : `${acc}/${parts[i]}`;
    out.push(`folder:${acc}`);
  }
  return out;
}

function parseIssueNodeFilePath(id: string): string | null {
  if (!id.startsWith("issue:")) {
    return null;
  }
  const rest = id.slice("issue:".length);
  const idxS = rest.lastIndexOf(":s:");
  const idxAi = rest.lastIndexOf(":ai:");
  const idx = Math.max(idxS, idxAi);
  if (idx <= 0) {
    return null;
  }
  return rest.slice(0, idx);
}

function buildFocusSet(
  selectedId: string | null,
  edges: Edge[],
  nodes: Node[],
): Set<string> {
  if (!selectedId) {
    return new Set();
  }
  const out = new Set<string>([selectedId]);

  for (const e of edges) {
    if (e.source === selectedId) {
      out.add(e.target);
    }
    if (e.target === selectedId) {
      out.add(e.source);
    }
  }

  if (selectedId.startsWith("file:")) {
    const p = filePathFromFileNodeId(selectedId);
    if (p) {
      for (const fid of hierarchyFolderIdsForFilePath(p)) {
        out.add(fid);
      }
    }
  }

  if (selectedId.startsWith("func:")) {
    const fn = parseFunctionNodeId(selectedId);
    if (fn) {
      const fid = `file:${fn.filePath}`;
      out.add(fid);
      for (const x of hierarchyFolderIdsForFilePath(fn.filePath)) {
        out.add(x);
      }
    }
  }

  if (selectedId.startsWith("issue:")) {
    const p = parseIssueNodeFilePath(selectedId);
    if (p) {
      out.add(`file:${p}`);
      for (const x of hierarchyFolderIdsForFilePath(p)) {
        out.add(x);
      }
    }
  }

  if (selectedId.startsWith("folder:")) {
    const prefix = selectedId.slice("folder:".length);
    for (const n of nodes) {
      if (n.id.startsWith("file:")) {
        const p = filePathFromFileNodeId(n.id);
        if (p && dirnameNorm(p) === prefix) {
          out.add(n.id);
        }
      }
      if (n.id.startsWith("folder:")) {
        const fp = n.id.slice("folder:".length);
        const parent = fp.includes("/")
          ? fp.slice(0, fp.lastIndexOf("/"))
          : "";
        if (parent === prefix) {
          out.add(n.id);
        }
      }
    }
  }

  return out;
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
  analysis?: AnalysisPayload | null;
};

function FitViewAfterLayout({ fitKey }: { fitKey: string }) {
  const { fitView } = useReactFlow();
  useLayoutEffect(() => {
    if (!fitKey) {
      return;
    }
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) {
          fitView({ padding: 0.12, duration: 220 });
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [fitKey, fitView]);
  return null;
}

function toggleFolderInSet(path: string, prev: Set<string>): Set<string> {
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

function GraphInner({ graphData, aiInsights, analysis }: Props) {
  const [highOnly, setHighOnly] = useState(false);
  const [probOnly, setProbOnly] = useState(false);
  const [folderFilterPrefix, setFolderFilterPrefix] = useState<string | null>(
    null,
  );
  const [directImportsOnly, setDirectImportsOnly] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [fitNonce, setFitNonce] = useState(0);

  const issueChildrenByFile = useMemo(
    () => buildIssueChildrenByFile(analysis ?? null, aiInsights),
    [analysis, aiInsights],
  );

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
    return new Set<string>([...expandedFolders, ...autoExpand]);
  }, [expandedFolders, autoExpand]);

  const onToggleFolder = useCallback((folderPath: string) => {
    setExpandedFolders((prev) => toggleFolderInSet(folderPath, prev));
  }, []);

  const onToggleFileExpand = useCallback((filePath: string) => {
    const p = normPath(filePath);
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(p)) {
        next.delete(p);
      } else {
        next.add(p);
      }
      return next;
    });
  }, []);

  const visibility: VisibilityOptions = useMemo(
    () => ({
      expandedFolders: effectiveExpandedFolders,
      expandedFiles,
      directImportsOnly,
      folderPrefix: folderFilterPrefix,
    }),
    [
      effectiveExpandedFolders,
      expandedFiles,
      directImportsOnly,
      folderFilterPrefix,
    ],
  );

  const flowCallbacks = useMemo(
    () => ({
      onToggleFolder,
      onToggleFileExpand,
    }),
    [onToggleFolder, onToggleFileExpand],
  );

  const structureKey = useMemo(() => {
    const parts = [
      [...filtered.nodes].map((n) => n.id).sort().join("\0"),
      [...effectiveExpandedFolders].sort().join("/"),
      folderFilterPrefix ?? "",
      String(directImportsOnly),
      [...expandedFiles].sort().join(","),
    ];
    return parts.join("|");
  }, [
    filtered.nodes,
    effectiveExpandedFolders,
    folderFilterPrefix,
    directImportsOnly,
    expandedFiles,
  ]);

  const fitKey = `${structureKey}#${fitNonce}`;

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () =>
      toFlowElements(filtered, {
        visibility,
        callbacks: flowCallbacks,
        useLayoutRoot: true,
        issueChildrenByFile,
      }),
    [filtered, visibility, flowCallbacks, issueChildrenByFile],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    const next = toFlowElements(filtered, {
      visibility,
      callbacks: flowCallbacks,
      useLayoutRoot: true,
      issueChildrenByFile,
    });
    setNodes(next.nodes);
    setEdges(next.edges);
    setSelectedId((prev) => {
      if (!prev) {
        return null;
      }
      return next.nodes.some((n) => n.id === prev) ? prev : null;
    });
  }, [
    filtered,
    visibility,
    flowCallbacks,
    issueChildrenByFile,
    setNodes,
    setEdges,
  ]);

  const focusSet = useMemo(
    () => buildFocusSet(selectedId, edges, nodes),
    [selectedId, edges, nodes],
  );

  const displayNodes = useMemo(() => {
    const dim = Boolean(selectedId);
    return nodes.map((n) => ({
      ...n,
      style: {
        ...n.style,
        opacity: !dim || focusSet.has(n.id) ? 1 : 0.22,
        transition: "opacity 0.22s ease",
      },
    }));
  }, [nodes, selectedId, focusSet]);

  const displayEdges = useMemo(() => {
    return edges.map((e) => {
      const connected =
        !!selectedId &&
        (e.source === selectedId || e.target === selectedId);
      let edgeOpacity: number;
      if (!selectedId) {
        edgeOpacity = 0.16;
      } else if (connected) {
        edgeOpacity = 0.44;
      } else {
        edgeOpacity = 0.06;
      }
      const hover = hoveredEdgeId === e.id;
      return {
        ...e,
        data: {
          ...e.data,
          edgeOpacity: hover ? 0.9 : edgeOpacity,
          hoverOpacity: hover ? 0.9 : undefined,
        },
      };
    });
  }, [edges, selectedId, hoveredEdgeId]);

  const resetView = useCallback(() => {
    setHighOnly(false);
    setProbOnly(false);
    setFolderFilterPrefix(null);
    setDirectImportsOnly(true);
    setExpandedFolders(new Set());
    setExpandedFiles(new Set());
    setSelectedId(null);
    setHoveredEdgeId(null);
    setFitNonce((n) => n + 1);
  }, []);

  const onNodeClick = useCallback((_: MouseEvent, node: Node) => {
    setSelectedId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedId(null);
  }, []);

  const onEdgeMouseEnter = useCallback(
    (_: MouseEvent, edge: Edge) => {
      setHoveredEdgeId(edge.id);
    },
    [],
  );

  const onEdgeMouseLeave = useCallback(() => {
    setHoveredEdgeId(null);
  }, []);

  const selectedViz: VizGraphNode | undefined = useMemo(() => {
    if (!selectedId) {
      return undefined;
    }
    if (
      selectedId.startsWith("folder:") ||
      selectedId.startsWith("issue:")
    ) {
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

  const selectedIssuePath = useMemo(() => {
    if (!selectedId?.startsWith("issue:")) {
      return null;
    }
    return parseIssueNodeFilePath(selectedId);
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

  const issueDetailAi = useMemo(() => {
    if (!selectedIssuePath) {
      return undefined;
    }
    return findAiInsight(selectedIssuePath, aiInsights);
  }, [selectedIssuePath, aiInsights]);

  if (graphData.nodes.length === 0) {
    return (
      <div className="flex h-[480px] items-center justify-center rounded-xl border border-dashed border-zinc-600 bg-zinc-950/80 text-sm text-zinc-400">
        Run analysis to build the dependency graph. Expand folders and files on
        the canvas to inspect issues and functions.
      </div>
    );
  }

  if (filtered.nodes.length === 0) {
    return (
      <div className="flex h-[480px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-amber-700/50 bg-amber-950/20 p-6 text-center text-sm text-amber-100">
        <p>No nodes match the current filters.</p>
        <button
          type="button"
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500"
          onClick={resetView}
        >
          Reset view
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[480px] flex-col gap-3 lg:h-[min(70vh,720px)] lg:flex-row lg:min-h-[520px]">
      <div className="relative h-[min(70vh,720px)] min-h-[480px] w-full shrink-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 lg:h-full lg:min-h-0 lg:flex-1">
        <ReactFlow
          className="h-full w-full !bg-zinc-950"
          colorMode="dark"
          nodes={displayNodes}
          edges={displayEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          minZoom={0.08}
          maxZoom={2}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onEdgeMouseEnter={onEdgeMouseEnter}
          onEdgeMouseLeave={onEdgeMouseLeave}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elevateEdgesOnSelect
          onlyRenderVisibleElements
        >
          <FitViewAfterLayout fitKey={fitKey} />
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            className="!bg-zinc-950"
            color="rgb(63 63 70 / 0.35)"
          />
          <Controls
            showInteractive={false}
            className="!border-zinc-700 !bg-zinc-900/95 !fill-zinc-300 [&_button]:!border-zinc-600"
          />
          <MiniMap
            zoomable
            pannable
            className="!rounded-md !border !border-zinc-700 !bg-zinc-900/95"
            maskColor="rgb(24 24 27 / 0.75)"
            nodeColor={() => "#52525b"}
          />
          <Panel
            position="top-left"
            className="m-2 flex max-h-[min(70vh,520px)] max-w-[min(100%,280px)] flex-col gap-2 overflow-y-auto rounded-lg border border-zinc-700/80 bg-zinc-900/95 p-3 text-[11px] text-zinc-200 shadow-xl backdrop-blur-sm"
          >
            <span className="text-xs font-semibold tracking-wide text-zinc-100">
              Graph
            </span>
            <button
              type="button"
              onClick={resetView}
              className="rounded-md border border-zinc-600 bg-zinc-800/80 px-2 py-1.5 text-left text-[10px] font-medium text-zinc-100 transition hover:bg-zinc-700"
            >
              Reset view
            </button>
            <label className="flex cursor-pointer items-center gap-2 text-zinc-300">
              <input
                type="checkbox"
                checked={highOnly}
                onChange={(e) => setHighOnly(e.target.checked)}
              />
              High complexity only
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-zinc-300">
              <input
                type="checkbox"
                checked={probOnly}
                onChange={(e) => setProbOnly(e.target.checked)}
              />
              Problematic files only
            </label>
            <div className="space-y-1 border-t border-zinc-700/80 pt-2">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
                Folder scope
              </div>
              <select
                className="w-full rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-[11px] text-zinc-100"
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
            <label className="flex cursor-pointer items-center gap-2 text-zinc-300">
              <input
                type="checkbox"
                checked={directImportsOnly}
                onChange={(e) => setDirectImportsOnly(e.target.checked)}
              />
              Imports only (hide calls / contains)
            </label>
            <p className="text-[10px] leading-relaxed text-zinc-500">
              Start with folders only — click a folder to show files. Click a
              file to load issues and functions under it. Edges brighten on
              hover; selected nodes keep neighbors and hierarchy in focus.
            </p>
            <div className="border-t border-zinc-700/80 pt-2 text-[9px] text-zinc-500">
              <div className="flex items-center gap-2">
                <span className="h-0.5 w-4 bg-zinc-400" /> imports
              </div>
              <div className="flex items-center gap-2">
                <span className="h-0.5 w-4 bg-amber-500" /> calls
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm bg-zinc-600" /> folder
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded border border-emerald-600 bg-emerald-950/50" />{" "}
                clean file
              </div>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      <aside className="w-full shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-200 shadow-sm lg:w-80">
        <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">
          Selection
        </h3>
        {!selectedId && (
          <p className="mt-2 text-zinc-400">
            Click a folder, file, function, or issue. Pan and zoom on the
            canvas; hover edges to emphasize them.
          </p>
        )}
        {selectedFolderPath && (
          <div className="mt-3 space-y-2">
            <div className="text-[10px] uppercase text-zinc-500">Folder</div>
            <div className="break-all font-mono text-sm font-semibold text-zinc-100">
              {selectedFolderPath}
            </div>
            <p className="text-xs text-zinc-400">
              Toggle the folder on the graph to show or hide files in this
              branch.
            </p>
          </div>
        )}
        {selectedIssuePath && (
          <div className="mt-3 space-y-2">
            <div className="text-[10px] uppercase text-zinc-500">Issue</div>
            <div className="break-all font-mono text-[11px] text-zinc-300">
              {selectedIssuePath}
            </div>
            {issueDetailAi && (
              <p className="text-xs leading-relaxed text-zinc-400">
                {issueDetailAi.explanation.slice(0, 400)}
                {issueDetailAi.explanation.length > 400 ? "…" : ""}
              </p>
            )}
          </div>
        )}
        {selectedViz && (
          <div className="mt-3 space-y-3">
            <div>
              <div className="text-[10px] uppercase text-zinc-500">
                {selectedViz.kind}
              </div>
              <div className="font-mono text-sm font-semibold text-zinc-100">
                {selectedViz.kind === "file"
                  ? selectedViz.filePath
                  : `${selectedViz.filePath} · ${selectedViz.functionName}`}
              </div>
            </div>
            {selectedViz.kind === "file" && (
              <ul className="space-y-1 text-xs text-zinc-400">
                <li>
                  Complexity tier:{" "}
                  <strong className="text-zinc-200">
                    {selectedViz.complexityTier ?? "—"}
                  </strong>
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
              <ul className="space-y-1 text-xs text-zinc-400">
                <li>
                  Cyclomatic complexity:{" "}
                  <strong className="text-zinc-200">
                    {selectedViz.cyclomaticComplexity ?? "—"}
                  </strong>
                </li>
              </ul>
            )}
            {detailAi ? (
              <div className="space-y-2 border-t border-zinc-700 pt-3">
                <div className="text-xs font-semibold text-violet-300">
                  Gemini · insight
                </div>
                <p className="text-xs leading-relaxed text-zinc-300">
                  {detailAi.explanation}
                </p>
                {detailAi.issues.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold uppercase text-amber-400">
                      Issues
                    </div>
                    <ul className="mt-1 list-inside list-disc text-xs text-zinc-300">
                      {detailAi.issues.map((t, i) => (
                        <li key={`iss-${i}`}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {detailAi.suggestions.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold uppercase text-sky-400">
                      Refactors
                    </div>
                    <ul className="mt-1 list-inside list-disc text-xs text-zinc-300">
                      {detailAi.suggestions.map((t, i) => (
                        <li key={`sug-${i}`}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              selectedViz.kind !== "function" && (
                <p className="border-t border-zinc-700 pt-3 text-xs text-zinc-500">
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
