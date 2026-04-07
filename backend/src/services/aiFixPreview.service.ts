import type { Logger } from "pino";
import type { Types } from "mongoose";
import { z } from "zod";
import type { Env } from "../config/env.js";
import { HttpError } from "../middleware/errorHandler.js";
import type { IAiFileInsight } from "../models/project.model.js";
import type { CodeSmell } from "./analysis/types.js";
import { readProjectFileContent } from "./projectEditor.service.js";

const MAX_SOURCE_CHARS = 55_000;

export type FixPreviewIssue = {
  message: string;
  line: number | null;
  severity: "info" | "warning" | "error";
  source: "static" | "ai";
  ruleId?: string;
};

export type AiFixPreviewResult = {
  filePath: string;
  originalCode: string;
  updatedCode: string;
  issues: FixPreviewIssue[];
  explanation: string;
  whatChanged: string;
  whyChanged: string;
  improvementSummary: string;
  /** True when Gemini produced updatedCode (not a fallback). */
  aiGenerated: boolean;
};

const llmResponseSchema = z.object({
  updatedCode: z.string(),
  explanation: z.string(),
  whatChanged: z.string().optional(),
  whyChanged: z.string().optional(),
  improvementSummary: z.string().optional(),
  issues: z
    .array(
      z.object({
        message: z.string(),
        line: z.number().int().positive().nullable().optional(),
        severity: z.enum(["info", "warning", "error"]).optional(),
        source: z.enum(["ai", "static"]).optional(),
      }),
    )
    .optional(),
});

function stripJsonFromMarkdown(raw: string): string {
  const t = raw.trim();
  const fence = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```$/i.exec(t);
  if (fence?.[1]) {
    return fence[1].trim();
  }
  return t;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function staticIssuesFromSmells(
  smells: CodeSmell[],
  filePath: string,
): FixPreviewIssue[] {
  const norm = filePath.replace(/\\/g, "/");
  return smells
    .filter((s) => s.filePath.replace(/\\/g, "/") === norm)
    .map((s) => ({
      message: `[${s.ruleId}] ${s.message}`,
      line: null,
      severity: s.severity,
      source: "static" as const,
      ruleId: s.ruleId,
    }));
}

function aiIssuesFromInsight(insight: IAiFileInsight | null): FixPreviewIssue[] {
  if (!insight) {
    return [];
  }
  return insight.issues.map((msg) => ({
    message: msg,
    line: null,
    severity: "warning" as const,
    source: "ai" as const,
  }));
}

function mergeIssues(
  staticOnes: FixPreviewIssue[],
  aiOnes: FixPreviewIssue[],
  fromModel: FixPreviewIssue[],
): FixPreviewIssue[] {
  const seen = new Set<string>();
  const out: FixPreviewIssue[] = [];
  for (const i of [...staticOnes, ...aiOnes, ...fromModel]) {
    const key = `${i.source}:${i.message}:${i.line ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({
      ...i,
      severity: i.severity ?? "info",
    });
  }
  return out;
}

function buildFallbackResult(
  filePath: string,
  originalCode: string,
  baseIssues: FixPreviewIssue[],
  reason: string,
): AiFixPreviewResult {
  return {
    filePath,
    originalCode,
    updatedCode: originalCode,
    issues: baseIssues,
    explanation: reason,
    whatChanged: "No automated rewrite was applied.",
    whyChanged: reason,
    improvementSummary:
      "Review the issues on the right and edit the suggested side manually, or configure the AI service.",
    aiGenerated: false,
  };
}

function buildUserPrompt(params: {
  filePath: string;
  language: string;
  originalCode: string;
  smellsJson: string;
  aiJson: string;
}): string {
  return [
    "You are a senior engineer. The user needs a corrected version of a source file.",
    "Return JSON ONLY with this exact shape:",
    '{"updatedCode":"<full corrected file source as a string, escape newlines as \\n>","explanation":"<2-5 sentences: what you did overall>","whatChanged":"<bullet-style summary of edits>","whyChanged":"<why these edits address the reported problems>","improvementSummary":"<one short sentence>","issues":[{"message":"<string>","line":<number or null>,"severity":"info"|"warning"|"error","source":"ai"}]}',
    "Rules:",
    "- updatedCode must be the COMPLETE file, not a fragment.",
    "- Preserve language and project style when possible.",
    "- Do not add commentary outside JSON.",
    "- issues: include the main problems you addressed (source must be \"ai\"); use line numbers when you can infer them from the code.",
    "",
    `Path: ${params.filePath}`,
    `Language: ${params.language}`,
    "Static smells (JSON):",
    params.smellsJson,
    "Prior AI review (JSON):",
    params.aiJson,
    "",
    "Current file contents:",
    "```",
    params.originalCode,
    "```",
  ].join("\n");
}

/**
 * Loads file from workspace, optionally calls Gemini for a full-file fix, and returns a unified preview payload.
 */
export async function generateAiFixPreview(params: {
  env: Env;
  log: Logger;
  projectId: string;
  sessionUserId: Types.ObjectId;
  accessToken: string;
  filePath: string;
  language: string;
  smells: CodeSmell[];
  aiInsight: IAiFileInsight | null;
}): Promise<AiFixPreviewResult> {
  const normPath = params.filePath.replace(/\\/g, "/");
  const { content: originalCode } = await readProjectFileContent(
    params.env,
    params.projectId,
    params.sessionUserId,
    params.accessToken,
    normPath,
    params.log,
  );

  if (originalCode.length > MAX_SOURCE_CHARS) {
    throw new HttpError(
      413,
      `File is too large for AI fix preview (max ${MAX_SOURCE_CHARS} characters).`,
      "PAYLOAD_TOO_LARGE",
    );
  }

  const staticIss = staticIssuesFromSmells(params.smells, normPath);
  const aiIss = aiIssuesFromInsight(params.aiInsight);
  const baseIssues = mergeIssues(staticIss, aiIss, []);

  if (!params.env.GEMINI_API_KEY?.trim()) {
    return buildFallbackResult(
      normPath,
      originalCode,
      baseIssues,
      "GEMINI_API_KEY is not configured on the server. Showing issues only; updated code matches the original until AI is enabled.",
    );
  }

  const smellsJson = JSON.stringify(
    params.smells.filter(
      (s) => s.filePath.replace(/\\/g, "/") === normPath,
    ),
    null,
    0,
  );
  const aiJson = params.aiInsight
    ? JSON.stringify(
        {
          explanation: params.aiInsight.explanation,
          issues: params.aiInsight.issues,
          suggestions: params.aiInsight.suggestions,
        },
        null,
        0,
      )
    : "{}";

  const apiKey = params.env.GEMINI_API_KEY;
  const modelId = params.env.GEMINI_MODEL.replace(/^models\//, "");
  const base = params.env.GEMINI_API_BASE.replace(/\/$/, "");
  const url = `${base}/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const systemText =
    "You output valid JSON only. No markdown fences. The updatedCode field must contain the full file.";

  const body = {
    systemInstruction: {
      parts: [{ text: systemText }],
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: buildUserPrompt({
              filePath: normPath,
              language: params.language,
              originalCode,
              smellsJson,
              aiJson,
            }),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  };

  let lastErr: unknown;
  const attempts = 1 + params.env.AI_MAX_RETRIES;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      params.env.AI_REQUEST_TIMEOUT_MS,
    );
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 500)}`);
      }

      const json = (await res.json()) as {
        error?: { message?: string };
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      if (json.error?.message) {
        throw new Error(`Gemini API error: ${json.error.message}`);
      }

      const parts = json.candidates?.[0]?.content?.parts;
      const raw = parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!raw.trim()) {
        throw new Error("Gemini response missing text");
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

      const decoded = llmResponseSchema.safeParse(parsed);
      if (!decoded.success) {
        params.log.warn(
          { issues: decoded.error.flatten() },
          "AI fix preview JSON failed validation",
        );
        return buildFallbackResult(
          normPath,
          originalCode,
          baseIssues,
          "The model returned an unexpected JSON shape. Try again or shorten the file.",
        );
      }

      const d = decoded.data;
      const modelIssues: FixPreviewIssue[] = (d.issues ?? []).map((i) => ({
        message: i.message,
        line: i.line ?? null,
        severity: i.severity ?? "info",
        source: "ai" as const,
      }));

      const allIssues = mergeIssues(staticIss, aiIss, modelIssues);

      return {
        filePath: normPath,
        originalCode,
        updatedCode: d.updatedCode,
        issues: allIssues,
        explanation: d.explanation,
        whatChanged: d.whatChanged ?? "",
        whyChanged: d.whyChanged ?? "",
        improvementSummary: d.improvementSummary ?? "",
        aiGenerated: true,
      };
    } catch (err) {
      lastErr = err;
      const retryable =
        err instanceof Error &&
        (err.name === "AbortError" ||
          err.message.includes("429") ||
          err.message.includes("503") ||
          err.message.includes("502") ||
          err.message.includes("500") ||
          err.message.includes("fetch failed"));

      params.log.warn({ err, attempt, retryable }, "AI fix preview request failed");

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

  const msg =
    lastErr instanceof Error ? lastErr.message : "Unknown LLM error";
  return buildFallbackResult(
    normPath,
    originalCode,
    baseIssues,
    `AI fix could not be generated: ${msg}`,
  );
}
