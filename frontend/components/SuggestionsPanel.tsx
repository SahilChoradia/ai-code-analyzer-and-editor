"use client";

import type {
  AiFileInsight,
  AnalysisPayload,
} from "@/types/api";

type Props = {
  analysis: AnalysisPayload | null;
  aiInsights?: AiFileInsight[];
  aiInsightsNotice?: string;
  selectedPath: string | null;
};

const STATIC_TIPS = [
  "Prefer smaller functions with a single responsibility.",
  "Reduce cyclomatic complexity by extracting branches into named helpers.",
  "Keep import graphs shallow—avoid deep chains of relative imports.",
  "Address parser warnings (truncated AST) by raising server AST limits for huge files.",
];

/**
 * Right column: static tips, smell-driven hints, and STEP 7 AI suggestions.
 */
export function SuggestionsPanel({
  analysis,
  aiInsights,
  aiInsightsNotice,
  selectedPath,
}: Props) {
  const smells =
    analysis?.files.flatMap((f) =>
      f.smells.map((s) => ({
        ...s,
        filePath: s.filePath || f.path,
      })),
    ) ?? [];

  const bySeverity = {
    error: smells.filter((s) => s.severity === "error"),
    warning: smells.filter((s) => s.severity === "warning"),
    info: smells.filter((s) => s.severity === "info"),
  };

  const aiForFile =
    selectedPath && aiInsights?.length
      ? aiInsights.find((i) => i.filePath === selectedPath)
      : undefined;

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Suggestions
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Static analysis smells plus AI refactoring ideas when available.
        </p>
      </header>

      {aiInsightsNotice && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {aiInsightsNotice}
        </div>
      )}

      {aiInsights && aiInsights.length > 0 && !selectedPath && (
        <p className="rounded-lg border border-violet-200 bg-violet-50/80 p-3 text-xs text-violet-950 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100">
          Select a file in the tree to view AI explanations and targeted refactor
          suggestions for that file ({aiInsights.length} file
          {aiInsights.length === 1 ? "" : "s"} enriched).
        </p>
      )}

      {aiForFile && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-200">
            AI · {selectedPath}
          </h3>
          {aiForFile.suggestions.length > 0 ? (
            <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
              {aiForFile.suggestions.map((s, i) => (
                <li
                  key={`ai-sug-${i}`}
                  className="rounded-md border border-violet-200/80 bg-white/80 px-3 py-2 dark:border-violet-900/60 dark:bg-slate-900/40"
                >
                  {s}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No specific refactor suggestions for this file.
            </p>
          )}
        </section>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
          Refactoring playbook
        </h3>
        <ul className="list-inside list-disc space-y-1 text-sm text-slate-600 dark:text-slate-400">
          {STATIC_TIPS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      {!analysis && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
          Run analysis to see code smells and targeted suggestions.
        </p>
      )}

      {analysis && smells.length === 0 && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          No smells reported for this snapshot. Nice and tidy.
        </p>
      )}

      {analysis && smells.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            From analysis ({smells.length})
          </h3>
          <SmellList title="Errors" items={bySeverity.error} tone="red" />
          <SmellList title="Warnings" items={bySeverity.warning} tone="amber" />
          <SmellList title="Info" items={bySeverity.info} tone="blue" />
        </section>
      )}
    </div>
  );
}

function SmellList({
  title,
  items,
  tone,
}: {
  title: string;
  items: Array<{
    ruleId: string;
    message: string;
    filePath: string;
    symbol?: string;
  }>;
  tone: "red" | "amber" | "blue";
}) {
  if (items.length === 0) {
    return null;
  }
  const border =
    tone === "red"
      ? "border-red-200 dark:border-red-900"
      : tone === "amber"
        ? "border-amber-200 dark:border-amber-900"
        : "border-blue-200 dark:border-blue-900";
  const bg =
    tone === "red"
      ? "bg-red-50 dark:bg-red-950/30"
      : tone === "amber"
        ? "bg-amber-50 dark:bg-amber-950/30"
        : "bg-blue-50 dark:bg-blue-950/30";

  return (
    <div className={`rounded-lg border ${border} ${bg} p-3`}>
      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
        {title} ({items.length})
      </h4>
      <ul className="mt-2 space-y-2">
        {items.slice(0, 40).map((s, i) => (
          <li key={`${s.ruleId}-${i}`} className="text-xs">
            <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
              {s.ruleId}
              {s.symbol ? ` · ${s.symbol}` : ""}
            </div>
            <div className="text-slate-800 dark:text-slate-200">{s.message}</div>
            <div className="truncate font-mono text-[10px] text-slate-500">
              {s.filePath}
            </div>
          </li>
        ))}
      </ul>
      {items.length > 40 && (
        <p className="mt-2 text-[10px] text-slate-500">
          …and {items.length - 40} more
        </p>
      )}
    </div>
  );
}
