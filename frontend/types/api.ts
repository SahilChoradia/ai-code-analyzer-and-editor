/**
 * Matches backend STEP 5 API envelope and domain payloads.
 */

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiFailureBody {
  success: false;
  error: {
    message: string;
    code: string;
  };
}

export interface ProjectFile {
  path: string;
  name: string;
  language: string;
  size: number;
}

/** STEP 7: per-file LLM output from POST /analyze pipeline. */
export interface AiFileInsight {
  filePath: string;
  explanation: string;
  issues: string[];
  suggestions: string[];
}

export type ProjectLifecycleStatus =
  | "uploaded"
  | "processing"
  | "queued"
  | "ai_processing"
  | "analyzed"
  | "completed"
  | "failed";

export interface ProjectRecord {
  _id: string;
  name: string;
  sourceType: "zip" | "github";
  repoUrl?: string;
  /** Present for repos ingested via GitHub OAuth (required for server-side edit workspace). */
  userId?: string;
  files: ProjectFile[];
  status: ProjectLifecycleStatus;
  analysisJobId?: string;
  analysisError?: string;
  createdAt?: string;
  ast?: {
    status: string;
    parsedFiles: number;
    failedFiles: { path: string; reason: string }[];
    totalTreeNodes: number;
    completedAt?: string;
  };
  aiInsights?: AiFileInsight[];
  aiInsightsAt?: string;
  aiInsightsNotice?: string;
}

export interface AnalysisSummary {
  fileCount: number;
  functionCount: number;
  classCount: number;
  importCount: number;
  avgCyclomaticComplexity: number;
  maxCyclomaticComplexity: number;
  smellCount: number;
}

export interface CodeSmell {
  ruleId: string;
  severity: "info" | "warning" | "error";
  message: string;
  filePath: string;
  symbol?: string;
  /** When present (future static analysis), shown in Fix & Edit. */
  line?: number;
}

export interface FileAnalysisRow {
  path: string;
  language: string;
  functions: Array<{
    name: string;
    cyclomaticComplexity: number;
    approxNodeCount: number;
    maxNestingDepth: number;
  }>;
  classes: Array<{ name: string; kind: string }>;
  imports: Array<{ specifier: string; isExternal: boolean }>;
  smells: CodeSmell[];
}

export interface DependencyEdge {
  from: string;
  to: string;
  kind: string;
}

export interface AnalysisPayload {
  summary: AnalysisSummary;
  files: FileAnalysisRow[];
  dependencyGraph: {
    nodes: string[];
    edges: DependencyEdge[];
  };
}

export interface ProjectAnalysisDoc {
  _id: string;
  projectId: string;
  analyzedAt: string;
  data: AnalysisPayload;
}

/** STEP 8: React Flow–ready graph (positions applied client-side). */
export interface VizGraphNode {
  id: string;
  kind: "file" | "function";
  label: string;
  filePath: string;
  functionName?: string;
  complexityTier?: "low" | "medium" | "high";
  maxCyclomatic?: number;
  smellCount?: number;
  cyclomaticComplexity?: number;
  ai?: {
    issueCount: number;
    suggestionCount: number;
    explanationPreview: string;
    severityTag: "none" | "info" | "warning" | "error";
  };
}

export interface VizGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: "import" | "call" | "contains";
}

export interface VizGraphData {
  nodes: VizGraphNode[];
  edges: VizGraphEdge[];
}

export interface ComplexityMetricRow {
  path: string;
  maxCyclomatic: number;
  avgCyclomatic: number;
  functionCount: number;
  smellCount: number;
  tier: "low" | "medium" | "high";
  hasErrorSmell: boolean;
}

export interface ResultsBundle {
  project: ProjectRecord;
  astFileCount: number;
  analysis: ProjectAnalysisDoc | null;
  graphData: VizGraphData;
  complexityMetrics: ComplexityMetricRow[];
  /** Same as project.aiInsights; duplicated for convenient dashboard use. */
  aiInsights: AiFileInsight[];
}

export interface IngestResponse {
  projectId: string;
  fileCount: number;
  status: string;
  analyzed: boolean;
}

export interface AnalyzeResponse {
  /** True when BullMQ accepted the job (poll analysis-progress until done). */
  queued?: boolean;
  jobId?: string | null;
  projectId?: string;
  analyzed: boolean;
  analyzedAt: string | null;
  summary: AnalysisSummary | null;
  /** Summary of the AI pass after static analysis. */
  aiInsightsMeta?: {
    fileCount: number;
    generatedAt: string | null;
    notice: string | null;
  };
}

/** GET /projects/:id/analysis-progress */
export interface AnalysisProgress {
  status: string;
  phase: "idle" | "queued" | "analysis" | "ai" | "done" | "failed" | string;
  jobId: string | null;
  error: string | null;
}

/** GET /auth/me */
export type AuthMeResponse =
  | {
      authenticated: true;
      user: {
        id: string;
        username: string;
        displayName?: string;
        avatar?: string;
      };
    }
  | { authenticated: false; user: null };

/** GET /repos */
export interface GithubRepoSummary {
  name: string;
  fullName: string;
  description: string | null;
  visibility: "public" | "private";
  defaultBranch: string;
  htmlUrl: string;
}

/** POST /projects/:projectId/ai-fix-preview */
export interface AiFixPreviewResponse {
  filePath: string;
  originalCode: string;
  updatedCode: string;
  issues: Array<{
    message: string;
    line: number | null;
    severity: "info" | "warning" | "error";
    source: "static" | "ai";
    ruleId?: string;
  }>;
  explanation: string;
  whatChanged: string;
  whyChanged: string;
  improvementSummary: string;
  aiGenerated: boolean;
}
