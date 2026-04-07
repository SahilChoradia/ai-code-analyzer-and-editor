import type { Logger } from "pino";
import { z } from "zod";
import type { Env } from "../config/env.js";
import type { SerializedAstNode } from "../utils/astSerializer.js";
import { astToCompactOutline } from "../utils/astOutline.js";
import type { FileAnalysisResult, ProjectAnalysisPayload } from "./analysis/types.js";
import { GeminiResponseCache } from "./geminiCache.service.js";

/** One file's AI output stored on {@link IProject}. */
export interface AiFileInsight {
  filePath: string;
  explanation: string;
  issues: string[];
  suggestions: string[];
}

const insightSchema = z.object({
  filePath: z.string().min(1),
  explanation: z.string().min(1),
  issues: z.array(z.string()),
  suggestions: z.array(z.string()),
});

const batchResponseSchema = z.object({
  insights: z.array(insightSchema),
});

interface FileAstLean {
  path: string;
  language: string;
  ast: SerializedAstNode;
}

interface FileJob {
  path: string;
  language: string;
  metrics: Record<string, unknown>;
  outline: string;
}

function metricsForPrompt(f: FileAnalysisResult): Record<string, unknown> {
  return {
    functions: f.functions.slice(0, 35).map((fn) => ({
      name: fn.name,
      cyclomaticComplexity: fn.cyclomaticComplexity,
      approxNodeCount: fn.approxNodeCount,
      maxNestingDepth: fn.maxNestingDepth,
    })),
    classes: f.classes.slice(0, 20).map((c) => ({
      name: c.name,
      kind: c.kind,
    })),
    imports: f.imports.slice(0, 25).map((i) => ({
      specifier: i.specifier,
      external: i.isExternal,
    })),
    smells: f.smells.map((s) => ({
      ruleId: s.ruleId,
      severity: s.severity,
      message: s.message,
      symbol: s.symbol,
    })),
  };
}

function prioritizeFiles(files: FileAnalysisResult[]): FileAnalysisResult[] {
  return [...files].sort((a, b) => {
    const smellDiff = b.smells.length - a.smells.length;
    if (smellDiff !== 0) {
      return smellDiff;
    }
    const maxCc = (f: FileAnalysisResult) =>
      f.functions.reduce((m, fn) => Math.max(m, fn.cyclomaticComplexity), 0);
    return maxCc(b) - maxCc(a);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function stripJsonFromMarkdown(raw: string): string {
  const t = raw.trim();
  const fence = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```$/i.exec(t);
  if (fence?.[1]) {
    return fence[1].trim();
  }
  return t;
}

/** Split long outlines with small overlap so the model keeps local context. */
function chunkOutline(text: string, maxLen: number, overlap: number): string[] {
  if (text.length <= maxLen) {
    return [text];
  }
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + maxLen, text.length);
    chunks.push(text.slice(i, end));
    if (end >= text.length) {
      break;
    }
    i = end - overlap;
    if (i < 0) {
      i = end;
    }
  }
  return chunks;
}

function expandJobsWithOutlineChunks(
  jobs: FileJob[],
  maxChunkChars: number,
): FileJob[] {
  const out: FileJob[] = [];
  for (const j of jobs) {
    const parts = chunkOutline(j.outline, maxChunkChars, 100);
    if (parts.length === 1) {
      out.push(j);
      continue;
    }
    parts.forEach((outline, idx) => {
      out.push({
        ...j,
        outline,
        metrics: {
          ...j.metrics,
          outlineChunk: `${idx + 1}/${parts.length}`,
        },
      });
    });
  }
  return out;
}

function estimateJobChars(job: FileJob): number {
  return 280 + JSON.stringify(job.metrics).length + job.outline.length;
}

/** Pack jobs into batches under a character budget (STEP 9). */
function buildAdaptiveBatches(
  jobs: FileJob[],
  charBudget: number,
  maxFilesPerBatch: number,
): FileJob[][] {
  const batches: FileJob[][] = [];
  let cur: FileJob[] = [];
  let curChars = 0;

  for (const j of jobs) {
    const size = estimateJobChars(j);
    const overBudget =
      cur.length > 0 &&
      (curChars + size > charBudget || cur.length >= maxFilesPerBatch);
    if (overBudget) {
      batches.push(cur);
      cur = [];
      curChars = 0;
    }
    cur.push(j);
    curChars += size;
  }
  if (cur.length > 0) {
    batches.push(cur);
  }
  return batches;
}

function mergeInsightsForPath(insights: AiFileInsight[]): AiFileInsight {
  const first = insights[0];
  if (!first) {
    throw new Error("mergeInsightsForPath: empty");
  }
  if (insights.length === 1) {
    return first;
  }
  const explanation = insights
    .map((i) => i.explanation.trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4000);
  const issues = [...new Set(insights.flatMap((i) => i.issues))].slice(0, 10);
  const suggestions = [
    ...new Set(insights.flatMap((i) => i.suggestions)),
  ].slice(0, 10);
  return {
    filePath: first.filePath,
    explanation:
      explanation.length > 0
        ? explanation
        : "Merged insight from multiple outline segments.",
    issues,
    suggestions,
  };
}

/**
 * Google Generative Language API (`generateContent`) with JSON mode.
 * Falls back gracefully when `GEMINI_API_KEY` is unset (empty insights + UI notice).
 * Uses retries/backoff on transient errors; optional Redis cache deduplicates batch prompts.
 */
export class AiService {
  constructor(
    private readonly env: Env,
    private readonly cache?: GeminiResponseCache,
  ) {}

  isEnabled(): boolean {
    return Boolean(this.env.GEMINI_API_KEY);
  }

  async generateInsightsForProject(
    payload: ProjectAnalysisPayload,
    astRows: FileAstLean[],
    log: Logger,
  ): Promise<{ insights: AiFileInsight[]; notice?: string }> {
    if (!this.isEnabled()) {
      return {
        insights: [],
        notice:
          "AI insights are disabled. Set GEMINI_API_KEY in the backend environment to enable explanations and suggestions.",
      };
    }

    const astByPath = new Map(
      astRows.map((r) => [r.path.replace(/\\/g, "/"), r]),
    );

    const ordered = prioritizeFiles(payload.files);
    const capped = ordered.slice(0, this.env.AI_MAX_FILES);

    const baseJobs: FileJob[] = [];
    for (const f of capped) {
      const norm = f.path.replace(/\\/g, "/");
      const row = astByPath.get(norm);
      const outline = row
        ? astToCompactOutline(
            row.ast,
            this.env.AI_MAX_OUTLINE_NODES,
            this.env.AI_MAX_OUTLINE_CHARS,
          )
        : "[No AST outline available for this path — infer from metrics only.]";

      baseJobs.push({
        path: norm,
        language: f.language,
        metrics: metricsForPrompt(f),
        outline,
      });
    }

    if (baseJobs.length === 0) {
      return { insights: [], notice: "No files available for AI review." };
    }

    const expanded = expandJobsWithOutlineChunks(
      baseJobs,
      this.env.AI_OUTLINE_CHUNK_CHARS,
    );

    const batches = buildAdaptiveBatches(
      expanded,
      this.env.AI_BATCH_CHAR_BUDGET,
      Math.min(6, Math.max(1, this.env.AI_BATCH_SIZE)),
    );

    const rawInsights: AiFileInsight[] = [];
    let hadFailure = false;

    await this.runPool(
      batches,
      this.env.AI_MAX_CONCURRENT_BATCHES,
      async (batch) => {
        const batchInsights = await this.callLlmForBatch(batch, log);
        if (batchInsights.length === 0) {
          hadFailure = true;
        }
        rawInsights.push(...batchInsights);
      },
    );

    const byPathMerged = new Map<string, AiFileInsight[]>();
    for (const ins of rawInsights) {
      const p = ins.filePath.replace(/\\/g, "/");
      const arr = byPathMerged.get(p) ?? [];
      arr.push(ins);
      byPathMerged.set(p, arr);
    }

    const mergedList: AiFileInsight[] = [];
    for (const [, group] of byPathMerged) {
      mergedList.push(mergeInsightsForPath(group));
    }

    const mergedByPath = new Map(
      mergedList.map((i) => [i.filePath.replace(/\\/g, "/"), i]),
    );
    const orderedInsights = baseJobs
      .map((j) => mergedByPath.get(j.path))
      .filter((x): x is AiFileInsight => Boolean(x));

    let notice: string | undefined;
    if (hadFailure && orderedInsights.length === 0) {
      notice =
        "AI insights could not be generated (LLM error or timeout). Static analysis results are still valid.";
    } else if (hadFailure && orderedInsights.length > 0) {
      notice =
        "Some batches could not be processed by the AI; showing partial insights.";
    } else if (orderedInsights.length < baseJobs.length) {
      notice =
        "AI returned fewer files than requested; results may be partial.";
    }

    return { insights: orderedInsights, notice };
  }

  private async runPool<T>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<void>,
  ): Promise<void> {
    if (items.length === 0) {
      return;
    }
    let index = 0;
    const workers = Math.min(limit, items.length);

    const worker = async (): Promise<void> => {
      for (;;) {
        const i = index;
        index += 1;
        if (i >= items.length) {
          break;
        }
        await fn(items[i]);
      }
    };

    await Promise.all(Array.from({ length: workers }, () => worker()));
  }

  private buildUserPrompt(batch: FileJob[]): string {
    const blocks = batch.map((job, idx) => {
      return [
        `### File ${idx + 1}`,
        `Path: ${job.path}`,
        `Language: ${job.language}`,
        "Static analysis (JSON):",
        JSON.stringify(job.metrics),
        "Structural AST outline (truncated; not necessarily complete source):",
        "```",
        job.outline,
        "```",
      ].join("\n");
    });

    return [
      "You review code context for a static-analysis tool.",
      "For EACH file entry above, produce:",
      "- explanation: 2–4 short sentences in plain language for a developer.",
      "- issues: bullet strings for likely bugs, risks, or confusions (0–6 items).",
      "- suggestions: concrete refactoring or optimization ideas (0–6 items).",
      "If outlineChunk is present in metrics, this is a segment of a larger file — focus on this segment.",
      "Do not invent line numbers or APIs not suggested by the outline/metrics.",
      "Respond with JSON only, shape:",
      '{"insights":[{"filePath":"<exact path from prompt>","explanation":"...","issues":["..."],"suggestions":["..."]}]}',
      "",
      ...blocks,
    ].join("\n");
  }

  private async callLlmForBatch(
    batch: FileJob[],
    log: Logger,
  ): Promise<AiFileInsight[]> {
    const fingerprint = GeminiResponseCache.fingerprint(
      this.env.GEMINI_MODEL,
      batch.map((b) => ({
        path: b.path,
        outline: b.outline,
        metrics: b.metrics,
      })),
    );

    if (this.cache) {
      const hit = await this.cache.get(fingerprint);
      if (hit && hit.length > 0) {
        return hit;
      }
    }

    const apiKey = this.env.GEMINI_API_KEY!;
    const modelId = this.env.GEMINI_MODEL.replace(/^models\//, "");
    const base = this.env.GEMINI_API_BASE.replace(/\/$/, "");
    const url = `${base}/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const systemText =
      "You are a careful senior software engineer. Output valid JSON only; no markdown code fences or commentary outside the JSON object.";

    const body = {
      systemInstruction: {
        parts: [{ text: systemText }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: this.buildUserPrompt(batch) }],
        },
      ],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    };

    let lastErr: unknown;
    const attempts = 1 + this.env.AI_MAX_RETRIES;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        this.env.AI_REQUEST_TIMEOUT_MS,
      );
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 500)}`);
        }

        const json = (await res.json()) as {
          error?: { message?: string; code?: number };
          promptFeedback?: { blockReason?: string };
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
            finishReason?: string;
          }>;
        };

        if (json.error?.message) {
          throw new Error(`Gemini API error: ${json.error.message}`);
        }

        const blocked = json.promptFeedback?.blockReason;
        if (blocked) {
          throw new Error(`Gemini blocked the prompt: ${blocked}`);
        }

        const parts = json.candidates?.[0]?.content?.parts;
        const raw = parts?.map((p) => p.text ?? "").join("") ?? "";
        if (!raw.trim()) {
          throw new Error("Gemini response missing text content");
        }

        const jsonText = stripJsonFromMarkdown(raw);

        let parsed: unknown;
        try {
          parsed = JSON.parse(jsonText);
        } catch (e) {
          throw new Error(
            `Invalid JSON from model: ${e instanceof Error ? e.message : String(e)}`,
          );
        }

        const decoded = batchResponseSchema.safeParse(parsed);
        if (!decoded.success) {
          log.warn(
            { issues: decoded.error.flatten(), batchPaths: batch.map((b) => b.path) },
            "AI batch JSON failed schema validation",
          );
          return [];
        }

        const expected = new Set(batch.map((b) => b.path));
        const out = decoded.data.insights.filter((i) => expected.has(i.filePath));

        if (this.cache && out.length > 0) {
          await this.cache.set(fingerprint, out);
        }

        return out;
      } catch (err) {
        lastErr = err;
        const retryable =
          err instanceof Error &&
          (err.name === "AbortError" ||
            err.message.includes("429") ||
            err.message.includes("503") ||
            err.message.includes("502") ||
            err.message.includes("500") ||
            err.message.includes("RESOURCE_EXHAUSTED") ||
            err.message.includes("quota") ||
            err.message.includes("fetch failed"));

        log.warn(
          { err, attempt, batchSize: batch.length, retryable },
          "AI batch request failed",
        );

        if (attempt < attempts && retryable) {
          const baseDelay = err instanceof Error && err.message.includes("429")
            ? 2000
            : 400;
          await sleep(baseDelay * 2 ** (attempt - 1));
          continue;
        }
        break;
      } finally {
        clearTimeout(timer);
      }
    }

    log.error({ err: lastErr }, "AI batch exhausted retries");
    return [];
  }
}
