import { getEnv } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { createLogger } from "./utils/logger.js";
import { analysisQueueEnabled } from "./queue/analysis.queue.js";
import { createAnalysisWorker } from "./queue/analysis.worker.js";
import { createDuplicateConnection } from "./queue/redis.connection.js";

/**
 * Standalone BullMQ worker process (use when WORKER_EMBEDDED=false on the API).
 */
async function bootstrap(): Promise<void> {
  const env = getEnv();
  const log = createLogger(env);

  if (!analysisQueueEnabled(env)) {
    log.error("REDIS_URL is not set — worker cannot start");
    process.exit(1);
  }

  await connectDatabase(env.MONGODB_URI, log);

  const cacheRedis =
    env.GEMINI_CACHE_TTL_SEC > 0 && env.REDIS_URL
      ? createDuplicateConnection(env.REDIS_URL)
      : null;

  const worker = createAnalysisWorker(env, log, cacheRedis);

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "Analysis job failed");
  });

  worker.on("completed", (job) => {
    log.info({ jobId: job.id }, "Analysis job completed");
  });

  log.info("Analysis worker listening on queue project-analysis");

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, "Worker shutdown");
    await worker.close();
    await disconnectDatabase(log);
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

void bootstrap().catch((err: unknown) => {
  console.error("Worker fatal error:", err);
  process.exit(1);
});
