import { Queue } from "bullmq";
import type { Env } from "../config/env.js";
import { createRedisConnection } from "./redis.connection.js";

const QUEUE_NAME = "project-analysis";

let analysisQueue: Queue | null = null;

export function analysisQueueEnabled(env: Env): boolean {
  return Boolean(env.REDIS_URL?.trim());
}

export function getAnalysisQueue(env: Env): Queue {
  if (!env.REDIS_URL) {
    throw new Error("REDIS_URL is required for analysis queue");
  }
  if (!analysisQueue) {
    analysisQueue = new Queue(QUEUE_NAME, {
      connection: createRedisConnection(env.REDIS_URL),
      defaultJobOptions: {
        attempts: 4,
        backoff: { type: "exponential", delay: 8000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 100 },
      },
    });
  }
  return analysisQueue;
}

/**
 * Enqueues analysis for a project. Uses stable jobId to avoid duplicate concurrent jobs.
 */
export async function enqueueProjectAnalysis(
  env: Env,
  projectId: string,
): Promise<{ jobId: string }> {
  const q = getAnalysisQueue(env);
  const job = await q.add(
    "analyze",
    { projectId },
    { jobId: `analysis-${projectId}` },
  );
  return { jobId: job.id ?? String(job.id) };
}

export { QUEUE_NAME };
