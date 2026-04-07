import type { Job } from "bullmq";
import type { Logger } from "pino";
import mongoose from "mongoose";
import type { Env } from "../config/env.js";
import { Project } from "../models/project.model.js";
import { runProjectAnalysisPipeline } from "../services/analysisPipeline.service.js";
import type IORedis from "ioredis";

export async function processAnalysisJob(
  job: Job<{ projectId: string }>,
  env: Env,
  log: Logger,
  redis: IORedis | null,
): Promise<void> {
  const { projectId: rawId } = job.data;
  if (!mongoose.isValidObjectId(rawId)) {
    throw new Error("Invalid projectId in job");
  }
  const projectId = new mongoose.Types.ObjectId(rawId);

  await Project.findByIdAndUpdate(projectId, {
    status: "processing",
    analysisJobId: String(job.id),
    $unset: { analysisError: 1 },
  });

  try {
    const result = await runProjectAnalysisPipeline(env, projectId, log, redis, {
      beforeAi: async () => {
        if (env.GEMINI_API_KEY) {
          await Project.findByIdAndUpdate(projectId, { status: "ai_processing" });
        }
      },
    });

    if (result.payload) {
      await Project.findByIdAndUpdate(projectId, { status: "completed" });
    } else {
      await Project.findByIdAndUpdate(projectId, { status: "uploaded" });
    }

    log.info({ projectId: rawId, jobId: job.id }, "Analysis job completed");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await Project.findByIdAndUpdate(projectId, {
      status: "failed",
      analysisError: message.slice(0, 2000),
    });
    log.error({ err, projectId: rawId, jobId: job.id }, "Analysis job failed");
    throw err;
  }
}
