"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { FileTree } from "@/components/FileTree";
import { Loader } from "@/components/Loader";
import { SuggestionsPanel } from "@/components/SuggestionsPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ApiError, getResults } from "@/lib/api";
import { coerceVizGraphData } from "@/lib/graphData";
import type { ComplexityMetricRow, ProjectRecord } from "@/types/api";

const AnalysisGraphView = dynamic(
  () =>
    import("@/components/visualization/AnalysisGraphView").then(
      (m) => m.AnalysisGraphView,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-96 items-center justify-center rounded-2xl border border-slate-200/90 bg-slate-50/80 backdrop-blur-sm transition-colors dark:border-slate-700 dark:bg-slate-900/40">
        <Loader label="Loading graph…" size="md" />
      </div>
    ),
  },
);

const CodeFixTab = dynamic(
  () => import("@/components/CodeFixTab").then((m) => m.CodeFixTab),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[480px] items-center justify-center rounded-2xl border border-slate-200/90 bg-slate-50/80 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/40">
        <Loader label="Loading editor…" size="md" />
      </div>
    ),
  },
);

function tierDot(tier: ComplexityMetricRow["tier"]): string {
  if (tier === "high") {
    return "bg-red-500";
  }
  if (tier === "medium") {
    return "bg-amber-400";
  }
  return "bg-emerald-500";
}

export default function DashboardPage() {
  const params = useParams();
  const raw = params.id;
  const id =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "graph" | "fix">("overview");

  const query = useQuery({
    queryKey: ["results", id],
    queryFn: () => getResults(id),
    enabled: Boolean(id),
  });

  if (!id) {
    return (
      <div className="p-8 text-center text-slate-600 dark:text-slate-400">
        Invalid dashboard URL.
        <Link href="/dashboard" className="ml-2 text-blue-600 underline">
          Repositories
        </Link>
      </div>
    );
  }

  if (query.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader label="Loading project results…" size="lg" />
      </div>
    );
  }

  if (query.isError) {
    const msg =
      query.error instanceof ApiError
        ? query.error.message
        : "Failed to load results.";
    return (
      <div className="mx-auto max-w-lg p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {msg}
        </div>
        <Link
          href="/dashboard"
          className="mt-4 inline-block text-blue-600 underline"
        >
          Back to repositories
        </Link>
      </div>
    );
  }

  const bundle = query.data;
  const analysisPayload = bundle.analysis?.data ?? null;
  const graphData = coerceVizGraphData(bundle.graphData);
  const aiInsights =
    bundle.aiInsights ?? bundle.project.aiInsights ?? [];
  const complexityMetrics = bundle.complexityMetrics ?? [];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-10 border-b border-slate-200/90 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/85">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2">
          <div>
            <Link
              href="/dashboard"
              className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              ← Repositories
            </Link>
            <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Project dashboard
            </h1>
            <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
              {id}
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-4">
        <nav
          className="flex gap-2 border-b border-slate-200 pb-3 dark:border-slate-700"
          aria-label="Dashboard views"
        >
          <button
            type="button"
            onClick={() => setTab("overview")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ease-out ${
              tab === "overview"
                ? "bg-blue-600 text-white shadow-md"
                : "text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setTab("graph")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ease-out ${
              tab === "graph"
                ? "bg-blue-600 text-white shadow-md"
                : "text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            Graph &amp; heatmap
          </button>
          <button
            type="button"
            onClick={() => setTab("fix")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ease-out ${
              tab === "fix"
                ? "bg-blue-600 text-white shadow-md"
                : "text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            Fix &amp; edit code
          </button>
        </nav>
      </div>

      {tab === "overview" && (
        <div className="mx-auto grid max-w-[1600px] gap-4 px-4 pb-10 lg:grid-cols-12">
          <aside className="lg:col-span-3">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Files
            </h2>
            <FileTree
              files={bundle.project.files}
              selectedPath={selectedPath}
              onSelectFile={setSelectedPath}
            />
          </aside>

          <main className="surface-card surface-card-hover p-5 sm:p-6 lg:col-span-6">
            <AnalysisPanel
              project={bundle.project}
              analysis={analysisPayload}
              selectedPath={selectedPath}
            />
          </main>

          <aside className="surface-card surface-card-hover p-5 sm:p-6 lg:col-span-3">
            <SuggestionsPanel
              analysis={analysisPayload}
              aiInsights={bundle.project.aiInsights}
              aiInsightsNotice={bundle.project.aiInsightsNotice}
              selectedPath={selectedPath}
            />
          </aside>
        </div>
      )}

      {tab === "fix" && (
        <div className="space-y-4">
          <div className="mx-auto max-w-[1600px] px-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Fix &amp; edit code
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Review issues, edit in Monaco, save to the server workspace, then
              push to GitHub. Requires GitHub sign-in and a repo you imported via
              OAuth.
            </p>
          </div>
          <CodeFixTab
            projectId={id}
            project={bundle.project as ProjectRecord}
            analysis={analysisPayload}
            aiInsights={bundle.aiInsights}
          />
        </div>
      )}

      {tab === "graph" && (
        <div className="mx-auto max-w-[1600px] space-y-6 px-4 pb-10">
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              Dependency graph · functions · imports · intra-file calls
            </h2>
            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
              Dagre layout, folder groups (expand on click), filters, and direct
              imports by default. Colors reflect severity; pan, zoom, and use the
              panel for scope and function loading.
            </p>
            <AnalysisGraphView
              graphData={graphData}
              aiInsights={aiInsights}
            />
          </section>

          {complexityMetrics.length > 0 && (
            <section className="surface-card surface-card-hover p-4 sm:p-5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Complexity metrics (per file)
              </h3>
              <div className="mt-3 max-h-56 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-600 dark:text-slate-400">
                      <th className="pb-2 pr-2">Tier</th>
                      <th className="pb-2 pr-2">Path</th>
                      <th className="pb-2 pr-2">Max cc</th>
                      <th className="pb-2 pr-2">Smells</th>
                    </tr>
                  </thead>
                  <tbody>
                    {complexityMetrics.slice(0, 24).map((row) => (
                      <tr
                        key={row.path}
                        className="border-b border-slate-100 dark:border-slate-800"
                      >
                        <td className="py-1.5 pr-2 align-middle">
                          <span
                            className={`inline-block h-2.5 w-2.5 rounded-full ${tierDot(row.tier)}`}
                            title={row.tier}
                          />
                        </td>
                        <td className="max-w-[280px] truncate py-1.5 pr-2 font-mono text-slate-800 dark:text-slate-200">
                          {row.path}
                        </td>
                        <td className="py-1.5 pr-2 tabular-nums text-slate-600 dark:text-slate-300">
                          {row.maxCyclomatic}
                        </td>
                        <td className="py-1.5 pr-2 tabular-nums text-slate-600 dark:text-slate-300">
                          {row.smellCount}
                          {row.hasErrorSmell && (
                            <span className="ml-1 text-red-600 dark:text-red-400">
                              !
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {complexityMetrics.length > 24 && (
                <p className="mt-2 text-[10px] text-slate-500">
                  Showing 24 of {complexityMetrics.length} files.
                </p>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
