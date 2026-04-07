"use client";

import type { AnalysisPayload, ProjectRecord } from "@/types/api";

type Props = {
  project: ProjectRecord;
  analysis: AnalysisPayload | null;
  selectedPath: string | null;
};

function formatBytes(n: number): string {
  if (n < 1024) {
    return `${n} B`;
  }
  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} KB`;
  }
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Center column: metrics, per-file insights, dependencies overview.
 */
export function AnalysisPanel({ project, analysis, selectedPath }: Props) {
  const fileRow = analysis?.files.find((f) => f.path === selectedPath);
  const aiForFile =
    selectedPath && project.aiInsights
      ? project.aiInsights.find((i) => i.filePath === selectedPath)
      : undefined;

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Code insights
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {project.name}{" "}
          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs dark:bg-slate-800">
            {project.status}
            {project.analysisJobId ? (
              <span className="ml-1 font-mono text-[10px] opacity-70">
                job:{project.analysisJobId.slice(0, 12)}…
              </span>
            ) : null}
          </span>
        </p>
      </header>

      {!analysis && (
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          No analysis document yet. Run <strong>Analyze code</strong> from the
          home page (or re-run analysis) to populate complexity, dependencies,
          and smells.
        </div>
      )}

      {analysis && (
        <>
          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Summary
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Metric
                label="Files"
                value={String(analysis.summary.fileCount)}
              />
              <Metric
                label="Functions"
                value={String(analysis.summary.functionCount)}
              />
              <Metric
                label="Classes"
                value={String(analysis.summary.classCount)}
              />
              <Metric
                label="Imports"
                value={String(analysis.summary.importCount)}
              />
              <Metric
                label="Avg complexity"
                value={analysis.summary.avgCyclomaticComplexity.toFixed(1)}
              />
              <Metric
                label="Max complexity"
                value={String(analysis.summary.maxCyclomaticComplexity)}
              />
              <Metric
                label="Smells"
                value={String(analysis.summary.smellCount)}
              />
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Dependencies
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <strong>{analysis.dependencyGraph.edges.length}</strong> internal
              import edges across{" "}
              <strong>{analysis.dependencyGraph.nodes.length}</strong> nodes.
            </p>
            {analysis.dependencyGraph.edges.length > 0 && (
              <ul className="mt-2 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-2 text-xs font-mono dark:border-slate-700 dark:bg-slate-900/60">
                {analysis.dependencyGraph.edges.slice(0, 80).map((e, i) => (
                  <li key={`${e.from}-${e.to}-${i}`} className="truncate py-0.5">
                    <span className="text-slate-500">{e.from}</span>
                    <span className="mx-1 text-blue-600 dark:text-blue-400">
                      →
                    </span>
                    <span className="text-slate-800 dark:text-slate-200">
                      {e.to}
                    </span>
                  </li>
                ))}
                {analysis.dependencyGraph.edges.length > 80 && (
                  <li className="text-slate-500">
                    …and {analysis.dependencyGraph.edges.length - 80} more
                  </li>
                )}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {selectedPath ? `File: ${selectedPath}` : "Select a file"}
            </h3>
            {!selectedPath && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Click a file in the tree to see functions, classes, and imports.
              </p>
            )}
            {selectedPath && !fileRow && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No analysis row for this path (AST may be partial).
              </p>
            )}
            {fileRow && (
              <div className="space-y-4 text-sm">
                {aiForFile && (
                  <div className="rounded-lg border border-violet-200 bg-violet-50/80 p-3 dark:border-violet-900 dark:bg-violet-950/30">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-violet-800 dark:text-violet-300">
                      AI explanation
                    </h4>
                    <p className="mt-2 text-slate-800 dark:text-slate-200">
                      {aiForFile.explanation}
                    </p>
                    {aiForFile.issues.length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                          Potential issues
                        </div>
                        <ul className="mt-1 list-inside list-disc text-xs text-slate-700 dark:text-slate-300">
                          {aiForFile.issues.map((t, idx) => (
                            <li key={`issue-${idx}`}>{t}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <h4 className="font-medium text-slate-800 dark:text-slate-200">
                    Functions ({fileRow.functions.length})
                  </h4>
                  <ul className="mt-1 max-h-36 space-y-1 overflow-y-auto rounded border border-slate-200 p-2 dark:border-slate-700">
                    {fileRow.functions.slice(0, 50).map((fn) => (
                      <li
                        key={fn.name + fn.cyclomaticComplexity}
                        className="flex justify-between gap-2 font-mono text-xs"
                      >
                        <span className="truncate">{fn.name}</span>
                        <span className="shrink-0 text-slate-500">
                          cc={fn.cyclomaticComplexity}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-slate-800 dark:text-slate-200">
                    Classes ({fileRow.classes.length})
                  </h4>
                  <ul className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    {fileRow.classes.map((c) => (
                      <li key={c.name + c.kind}>
                        {c.name}{" "}
                        <span className="text-slate-400">({c.kind})</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-slate-800 dark:text-slate-200">
                    Imports ({fileRow.imports.length})
                  </h4>
                  <ul className="mt-1 max-h-32 overflow-y-auto text-xs font-mono text-slate-600 dark:text-slate-400">
                    {fileRow.imports.map((imp, i) => (
                      <li key={`${imp.specifier}-${i}`} className="truncate">
                        {imp.specifier}
                        {imp.isExternal && (
                          <span className="ml-1 text-amber-600 dark:text-amber-400">
                            ext
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Project files (manifest)
        </h3>
        <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-slate-600 dark:text-slate-400">
          {project.files.slice(0, 100).map((f) => (
            <li key={f.path} className="flex justify-between gap-2 font-mono">
              <span className="truncate">{f.path}</span>
              <span className="shrink-0 text-slate-400">
                {formatBytes(f.size)}
              </span>
            </li>
          ))}
          {project.files.length > 100 && (
            <li className="text-slate-500">
              …and {project.files.length - 100} more files
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900/50">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
        {value}
      </div>
    </div>
  );
}
