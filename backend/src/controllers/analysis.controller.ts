import type { NextFunction, Request, Response } from "express";
import type { Logger } from "pino";
import type { Env } from "../config/env.js";
import type { Types } from "mongoose";
import { HttpError } from "../middleware/errorHandler.js";
import { Project } from "../models/project.model.js";
import { ProjectAnalysis } from "../models/projectAnalysis.model.js";
import { analysisQueueEnabled, enqueueProjectAnalysis } from "../queue/analysis.queue.js";
import { getApiRedis } from "../queue/redis.shared.js";
import { runProjectAnalysisPipeline } from "../services/analysisPipeline.service.js";
import { AnalysisService } from "../services/analysis.service.js";
import { sendSuccess } from "../utils/responseFormatter.js";

const BUSY_STATUSES = new Set(["queued", "processing", "ai_processing"]);

const RERUN_STATUSES = new Set([
  "uploaded",
  "completed",
  "analyzed",
  "failed",
]);

function phaseFromStatus(status: string): string {
  switch (status) {
    case "queued":
      return "queued";
    case "processing":
      return "analysis";
    case "ai_processing":
      return "ai";
    case "completed":
    case "analyzed":
      return "done";
    case "failed":
      return "failed";
    default:
      return "idle";
  }
}

/**
 * Triggers analysis (STEP 4/5) — queue when REDIS_URL is set, else synchronous.
 */
export function createAnalysisController(env: Env, rootLog: Logger) {
  const service = new AnalysisService(env);

  function requestLog(req: Request): Logger {
    const withLog = req as Request & { log?: Logger };
    return withLog.log ?? rootLog;
  }

  return {
    postAnalyze: async (
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      const { projectId } = req.body as { projectId: string };
      let markFailedOnError: Types.ObjectId | null = null;

      try {
        const project = await Project.findById(projectId);
        if (!project) {
          throw new HttpError(404, "Project not found", "NOT_FOUND");
        }
        markFailedOnError = project._id;

        if (BUSY_STATUSES.has(project.status)) {
          throw new HttpError(
            409,
            "Analysis is already running for this project",
            "ANALYSIS_IN_PROGRESS",
          );
        }

        if (!RERUN_STATUSES.has(project.status)) {
          throw new HttpError(
            400,
            `Project status "${project.status}" cannot start analysis`,
            "BAD_REQUEST",
          );
        }

        const log = requestLog(req);
        log.info({ projectId }, "Starting analysis run");

        if (analysisQueueEnabled(env)) {
          try {
            const { jobId } = await enqueueProjectAnalysis(env, projectId);
            await Project.findByIdAndUpdate(project._id, {
              status: "queued",
              analysisJobId: jobId,
              $unset: { analysisError: 1 },
            });
            sendSuccess(
              res,
              {
                queued: true,
                jobId,
                projectId,
                analyzed: false,
                analyzedAt: null,
                summary: null,
                aiInsightsMeta: null,
              },
              { message: "Analysis queued" },
            );
          } catch (queueErr: unknown) {
            log.error({ err: queueErr, projectId }, "Failed to enqueue analysis");
            throw queueErr;
          }
          return;
        }

        await Project.findByIdAndUpdate(project._id, {
          status: "processing",
          $unset: { analysisError: 1 },
        });

        const redis = getApiRedis(env);
        const result = await runProjectAnalysisPipeline(
          env,
          project._id,
          log,
          redis,
          {
            beforeAi: async () => {
              if (env.GEMINI_API_KEY) {
                await Project.findByIdAndUpdate(project._id, {
                  status: "ai_processing",
                });
              }
            },
          },
        );

        if (result.payload) {
          await Project.findByIdAndUpdate(project._id, { status: "completed" });
        } else {
          await Project.findByIdAndUpdate(project._id, { status: "uploaded" });
        }

        const row = await ProjectAnalysis.findOne({
          projectId: project._id,
        }).lean<{
          analyzedAt: Date;
          data: { summary: unknown };
        } | null>();

        sendSuccess(
          res,
          {
            queued: false,
            jobId: null,
            projectId,
            analyzed: Boolean(result.payload),
            analyzedAt: row?.analyzedAt ?? null,
            summary: row?.data?.summary ?? result.summary ?? null,
            aiInsightsMeta: result.aiInsightsMeta,
          },
          { message: "Analysis run completed" },
        );
      } catch (err) {
        if (markFailedOnError) {
          const fatal =
            !(err instanceof HttpError) ||
            (err instanceof HttpError && err.statusCode >= 500);
          if (fatal) {
            await Project.findByIdAndUpdate(markFailedOnError, {
              status: "failed",
            }).catch(() => {
              /* ignore */
            });
          }
        }
        next(err);
      }
    },

    getAnalysisProgress: async (
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      try {
        const raw = req.params.projectId;
        const projectId =
          typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
        const doc = await Project.findById(projectId).lean<{
          status: string;
          analysisJobId?: string;
          analysisError?: string;
        } | null>();
        if (!doc) {
          throw new HttpError(404, "Project not found", "NOT_FOUND");
        }
        sendSuccess(
          res,
          {
            status: doc.status,
            phase: phaseFromStatus(doc.status),
            jobId: doc.analysisJobId ?? null,
            error: doc.analysisError ?? null,
          },
          { message: "Analysis progress" },
        );
      } catch (err) {
        next(err);
      }
    },

    getAnalysis: async (
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      try {
        const raw = req.params.projectId;
        const projectId =
          typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
        const doc = await service.getAnalysisOrThrow(projectId);
        sendSuccess(res, { analysis: doc }, { message: "Analysis document" });
      } catch (err) {
        next(err);
      }
    },
  };
}
