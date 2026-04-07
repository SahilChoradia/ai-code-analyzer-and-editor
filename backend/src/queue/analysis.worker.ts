import { Worker } from "bullmq";
import type { Logger } from "pino";
import type { Env } from "../config/env.js";
import { createDuplicateConnection } from "./redis.connection.js";
import { processAnalysisJob } from "./analysis.processor.js";
import { QUEUE_NAME } from "./analysis.queue.js";

/**
 * BullMQ worker: runs static analysis + Gemini in the background.
 */
export function createAnalysisWorker(
  env: Env,
  log: Logger,
  redisForCache: ReturnType<typeof createDuplicateConnection> | null,
): Worker {
  if (!env.REDIS_URL) {
    throw new Error("REDIS_URL required for worker");
  }

  const connection = createDuplicateConnection(env.REDIS_URL);

  return new Worker(
    QUEUE_NAME,
    async (job) => {
      await processAnalysisJob(job, env, log, redisForCache);
    },
    {
      connection,
      concurrency: env.WORKER_CONCURRENCY,
    },
  );
}
