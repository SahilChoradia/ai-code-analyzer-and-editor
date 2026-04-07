import type { Logger } from "pino";
import type mongoose from "mongoose";
import type { Env } from "../config/env.js";
import { FileAst } from "../models/fileAst.model.js";
import { Project } from "../models/project.model.js";
import { ProjectAnalysis } from "../models/projectAnalysis.model.js";
import type { SerializedAstNode } from "../utils/astSerializer.js";
import { AiService } from "./ai.service.js";
import { AnalysisService } from "./analysis.service.js";
import type { ProjectAnalysisPayload } from "./analysis/types.js";
import { GeminiResponseCache } from "./geminiCache.service.js";
import type IORedis from "ioredis";

export interface AiInsightsMeta {
  fileCount: number;
  generatedAt: string | null;
  notice: string | null;
}

export interface PipelineResult {
  payload: ProjectAnalysisPayload | null;
  aiInsightsMeta: AiInsightsMeta;
  analyzedAt: Date | null;
  summary: unknown;
}

export interface PipelineHooks {
  /** Invoked after static analysis succeeded and before Gemini (e.g. set `ai_processing`). */
  beforeAi?: () => Promise<void>;
}

/**
 * Static analysis + optional Gemini (Redis-backed response cache when `redis` is set).
 */
export async function runProjectAnalysisPipeline(
  env: Env,
  projectId: mongoose.Types.ObjectId,
  log: Logger,
  redis: IORedis | null,
  hooks?: PipelineHooks,
): Promise<PipelineResult> {
  const analysisService = new AnalysisService(env);
  const pathsDoc = await Project.findById(projectId).lean<{
    files: { path: string }[];
  } | null>();
  if (!pathsDoc) {
    throw new Error("Project not found");
  }
  const paths = pathsDoc.files.map((f) => f.path);

  const payload = await analysisService.analyzeAndPersist(projectId, paths, log);

  let aiInsightsMeta: AiInsightsMeta = {
    fileCount: 0,
    generatedAt: null,
    notice: null,
  };

  const geminiOn = Boolean(env.GEMINI_API_KEY);

  if (payload && geminiOn) {
    await hooks?.beforeAi?.();
    const cache =
      redis && env.GEMINI_CACHE_TTL_SEC > 0
        ? new GeminiResponseCache(redis, env.GEMINI_CACHE_TTL_SEC)
        : undefined;
    const aiService = new AiService(env, cache);
    const astRows = await FileAst.find({ projectId }).lean();
    try {
      const { insights, notice } = await aiService.generateInsightsForProject(
        payload,
        astRows.map((r) => ({
          path: r.path,
          language: r.language,
          ast: r.ast as SerializedAstNode,
        })),
        log,
      );
      const generatedAt = new Date();
      await Project.findByIdAndUpdate(projectId, {
        $set: {
          aiInsights: insights,
          aiInsightsAt: generatedAt,
          ...(notice ? { aiInsightsNotice: notice } : {}),
        },
        ...(notice ? {} : { $unset: { aiInsightsNotice: 1 } }),
      });
      aiInsightsMeta = {
        fileCount: insights.length,
        generatedAt: generatedAt.toISOString(),
        notice: notice ?? null,
      };
      log.info(
        {
          projectId: String(projectId),
          aiFiles: insights.length,
          hasNotice: Boolean(notice),
        },
        "AI insights persisted",
      );
    } catch (aiErr: unknown) {
      log.error(
        { err: aiErr, projectId: String(projectId) },
        "AI pipeline error",
      );
      const generatedAt = new Date();
      const fallback =
        "AI insights could not be generated due to an internal error.";
      await Project.findByIdAndUpdate(projectId, {
        $set: {
          aiInsights: [],
          aiInsightsAt: generatedAt,
          aiInsightsNotice: fallback,
        },
      });
      aiInsightsMeta = {
        fileCount: 0,
        generatedAt: generatedAt.toISOString(),
        notice: fallback,
      };
    }
  } else if (payload && !geminiOn) {
    const generatedAt = new Date();
    await Project.findByIdAndUpdate(projectId, {
      $set: {
        aiInsights: [],
        aiInsightsAt: generatedAt,
        aiInsightsNotice:
          "AI insights are disabled. Set GEMINI_API_KEY in the backend environment to enable explanations and suggestions.",
      },
    });
    aiInsightsMeta = {
      fileCount: 0,
      generatedAt: generatedAt.toISOString(),
      notice:
        "AI insights are disabled. Set GEMINI_API_KEY in the backend environment to enable explanations and suggestions.",
    };
  }

  const row = await ProjectAnalysis.findOne({ projectId }).lean<{
    analyzedAt: Date;
    data: { summary: unknown };
  } | null>();

  return {
    payload,
    aiInsightsMeta,
    analyzedAt: row?.analyzedAt ?? null,
    summary: row?.data?.summary ?? payload?.summary ?? null,
  };
}
