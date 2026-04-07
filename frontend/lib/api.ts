import axios, { type AxiosError, type AxiosResponse } from "axios";
import type {
  AiFixPreviewResponse,
  AnalysisPayload,
  AnalysisProgress,
  AnalyzeResponse,
  ApiFailureBody,
  ApiSuccess,
  AuthMeResponse,
  GithubRepoSummary,
  IngestResponse,
  ProjectAnalysisDoc,
  ResultsBundle,
} from "@/types/api";

/**
 * Prefer `NEXT_PUBLIC_API_URL` in `.env.local`; fallback keeps SSR/build from failing
 * when the var is unset (browser calls still work against local API in dev).
 */
function getBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (url) {
    return url.replace(/\/$/, "");
  }
  return "http://localhost:4000";
}

export const api = axios.create({
  baseURL: getBaseUrl(),
  timeout: 120_000,
  headers: { Accept: "application/json" },
  withCredentials: true,
});

export function getApiOrigin(): string {
  return getBaseUrl();
}

export class ApiError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

function unwrapSuccess<T>(res: AxiosResponse<ApiSuccess<T> | ApiFailureBody>): T {
  const body = res.data;
  if (body && "success" in body) {
    if (body.success === false) {
      throw new ApiError(
        body.error.code,
        body.error.message,
        res.status,
      );
    }
    return body.data;
  }
  throw new ApiError("INVALID_RESPONSE", "Unexpected response shape", res.status);
}

async function handle<T>(p: Promise<AxiosResponse<ApiSuccess<T> | ApiFailureBody>>): Promise<T> {
  try {
    const res = await p;
    return unwrapSuccess<T>(res);
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const ax = err as AxiosError<ApiFailureBody>;
      const d = ax.response?.data;
      if (d && d.success === false && d.error) {
        throw new ApiError(
          d.error.code,
          d.error.message,
          ax.response?.status,
        );
      }
      if (ax.code === "ECONNABORTED") {
        throw new ApiError("TIMEOUT", "Request timed out", ax.response?.status);
      }
      if (!ax.response) {
        throw new ApiError(
          "NETWORK_ERROR",
          "Cannot reach the API. Is the backend running?",
        );
      }
    }
    throw err;
  }
}

export async function getAuthMe(): Promise<AuthMeResponse> {
  return handle(
    api.get<ApiSuccess<AuthMeResponse> | ApiFailureBody>("/auth/me"),
  );
}

export async function logoutSession(): Promise<{ ok: boolean }> {
  return handle(
    api.post<ApiSuccess<{ ok: boolean }> | ApiFailureBody>("/auth/logout"),
  );
}

export async function listGithubRepos(): Promise<{ repos: GithubRepoSummary[] }> {
  return handle(
    api.get<ApiSuccess<{ repos: GithubRepoSummary[] }> | ApiFailureBody>(
      "/repos",
    ),
  );
}

export async function ingestGithubRepo(
  owner: string,
  repo: string,
): Promise<IngestResponse> {
  return handle(
    api.post<ApiSuccess<IngestResponse> | ApiFailureBody>(
      "/ingest/github",
      { owner: owner.trim(), repo: repo.trim() },
      { timeout: 180_000 },
    ),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getAnalysisProgress(
  projectId: string,
): Promise<AnalysisProgress> {
  return handle(
    api.get<ApiSuccess<AnalysisProgress> | ApiFailureBody>(
      `/projects/${encodeURIComponent(projectId)}/analysis-progress`,
    ),
  );
}

/**
 * Starts analysis. When the API uses Redis + BullMQ, polls until `phase` is done or failed.
 */
export async function analyzeProject(
  projectId: string,
  onProgress?: (p: AnalysisProgress) => void,
): Promise<AnalyzeResponse> {
  const data = await handle(
    api.post<ApiSuccess<AnalyzeResponse> | ApiFailureBody>(
      "/analyze",
      { projectId },
      { timeout: 60_000 },
    ),
  );

  if (data.queued) {
    const maxTicks = 200;
    for (let tick = 0; tick < maxTicks; tick += 1) {
      const p = await getAnalysisProgress(projectId);
      onProgress?.(p);
      if (p.phase === "done") {
        break;
      }
      if (p.phase === "failed") {
        throw new ApiError(
          "ANALYSIS_FAILED",
          p.error ?? "Analysis failed",
          500,
        );
      }
      if (tick === maxTicks - 1) {
        throw new ApiError(
          "ANALYSIS_TIMEOUT",
          "Analysis is taking too long. Check the worker and Redis, then refresh the dashboard.",
          504,
        );
      }
      await sleep(1300);
    }
    return {
      queued: false,
      jobId: null,
      projectId,
      analyzed: true,
      analyzedAt: new Date().toISOString(),
      summary: null,
      aiInsightsMeta: undefined,
    };
  }

  return data;
}

export async function getResults(projectId: string): Promise<ResultsBundle> {
  return handle(
    api.get<ApiSuccess<ResultsBundle> | ApiFailureBody>(
      `/results/${encodeURIComponent(projectId)}`,
    ),
  );
}

export async function getProjectFileContent(
  projectId: string,
  filePath: string,
): Promise<{ content: string; path: string }> {
  return handle(
    api.get<ApiSuccess<{ content: string; path: string }> | ApiFailureBody>(
      `/projects/${encodeURIComponent(projectId)}/file-content`,
      { params: { path: filePath } },
    ),
  );
}

export async function saveProjectFile(
  projectId: string,
  filePath: string,
  content: string,
): Promise<{ path: string; bytesWritten: number }> {
  return handle(
    api.post<
      ApiSuccess<{ path: string; bytesWritten: number }> | ApiFailureBody
    >(`/projects/${encodeURIComponent(projectId)}/save-file`, {
      path: filePath,
      content,
    }),
  );
}

export async function pushProjectChanges(
  projectId: string,
  body: { message?: string; branch?: string },
): Promise<{ branch: string; commitSha: string }> {
  return handle(
    api.post<ApiSuccess<{ branch: string; commitSha: string }> | ApiFailureBody>(
      `/projects/${encodeURIComponent(projectId)}/push-changes`,
      body,
      { timeout: 180_000 },
    ),
  );
}

export async function postAiFixPreview(
  projectId: string,
  filePath: string,
): Promise<AiFixPreviewResponse> {
  return handle(
    api.post<ApiSuccess<AiFixPreviewResponse> | ApiFailureBody>(
      `/projects/${encodeURIComponent(projectId)}/ai-fix-preview`,
      { path: filePath },
      { timeout: 180_000 },
    ),
  );
}

/** Optional: raw analysis document only. */
export async function getAnalysisDocument(
  projectId: string,
): Promise<{ analysis: ProjectAnalysisDoc }> {
  return handle(
    api.get<ApiSuccess<{ analysis: ProjectAnalysisDoc }> | ApiFailureBody>(
      `/projects/${encodeURIComponent(projectId)}/analysis`,
    ),
  );
}

export type { AnalysisPayload };
