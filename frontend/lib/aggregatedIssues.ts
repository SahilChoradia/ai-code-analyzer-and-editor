import type { AiFileInsight, AnalysisPayload } from "@/types/api";

export type AggregatedSmell = {
  ruleId: string;
  severity: string;
  message: string;
  line: number | null;
};

export type AggregatedIssueRow = {
  path: string;
  smells: AggregatedSmell[];
  aiIssues: string[];
  aiSuggestions: string[];
  aiExplanation?: string;
};

/** Best-effort line hint when static analysis does not provide `line`. */
export function guessLineFromMessage(msg: string): number | null {
  const a = /line\s*:?\s*(\d+)/i.exec(msg);
  if (a) {
    return parseInt(a[1]!, 10);
  }
  const b = /\b(\d{1,6})\s*:\s*\d{1,6}\b/.exec(msg);
  if (b) {
    return parseInt(b[1]!, 10);
  }
  return null;
}

export function aggregateIssues(
  analysis: AnalysisPayload | null | undefined,
  aiInsights: AiFileInsight[],
): AggregatedIssueRow[] {
  const map = new Map<string, AggregatedIssueRow>();

  function rowFor(p: string): AggregatedIssueRow {
    const path = p.replace(/\\/g, "/");
    let r = map.get(path);
    if (!r) {
      r = { path, smells: [], aiIssues: [], aiSuggestions: [] };
      map.set(path, r);
    }
    return r;
  }

  if (analysis?.files) {
    for (const f of analysis.files) {
      for (const s of f.smells) {
        const row = rowFor(s.filePath);
        const line =
          typeof s.line === "number" && s.line > 0
            ? s.line
            : guessLineFromMessage(s.message);
        row.smells.push({
          ruleId: s.ruleId,
          severity: s.severity,
          message: s.message,
          line,
        });
      }
    }
  }

  for (const a of aiInsights) {
    const row = rowFor(a.filePath);
    row.aiIssues.push(...a.issues);
    row.aiSuggestions.push(...a.suggestions);
    if (a.explanation) {
      row.aiExplanation = a.explanation;
    }
  }

  return [...map.values()].filter(
    (r) => r.smells.length || r.aiIssues.length || r.aiSuggestions.length,
  );
}
