import type { AiFileInsight, AnalysisPayload } from "@/types/api";
import { aggregateIssues } from "@/lib/aggregatedIssues";

export type IssueChildDef = {
  id: string;
  label: string;
  severity: "info" | "warning" | "error";
  source: "static" | "ai";
};

const MAX_ISSUES_PER_FILE = 8;
const MAX_LABEL = 42;

/**
 * Build small issue nodes for expanded file view (static smells + AI issue strings).
 */
export function buildIssueChildrenByFile(
  analysis: AnalysisPayload | null | undefined,
  aiInsights: AiFileInsight[],
): Map<string, IssueChildDef[]> {
  const rows = aggregateIssues(analysis ?? null, aiInsights);
  const map = new Map<string, IssueChildDef[]>();

  for (const row of rows) {
    const path = row.path.replace(/\\/g, "/");
    const items: IssueChildDef[] = [];
    let seq = 0;

    for (const s of row.smells) {
      const sev =
        s.severity === "error" || s.severity === "warning" || s.severity === "info"
          ? s.severity
          : "warning";
      const msg = s.message.trim().slice(0, MAX_LABEL);
      items.push({
        id: `issue:${path}:s:${seq++}`,
        label: msg.length < s.message.length ? `${msg}…` : msg,
        severity: sev,
        source: "static",
      });
    }

    for (const t of row.aiIssues) {
      const msg = t.trim().slice(0, MAX_LABEL);
      items.push({
        id: `issue:${path}:ai:${seq++}`,
        label: msg.length < t.length ? `${msg}…` : msg,
        severity: "warning",
        source: "ai",
      });
    }

    if (items.length > 0) {
      map.set(path, items.slice(0, MAX_ISSUES_PER_FILE));
    }
  }

  return map;
}
