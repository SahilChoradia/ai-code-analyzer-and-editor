import { createServer } from "node:http";
import type { Worker } from "bullmq";
import { getEnv } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { createApp } from "./app.js";
import { analysisQueueEnabled } from "./queue/analysis.queue.js";
import { createAnalysisWorker } from "./queue/analysis.worker.js";
import { createDuplicateConnection } from "./queue/redis.connection.js";
import { createLogger } from "./utils/logger.js";

/**
 * HTTP server entrypoint — loads config, connects MongoDB, starts listening.
 */
async function bootstrap(): Promise<void> {
  const env = getEnv();
  const log = createLogger(env);

  await connectDatabase(env.MONGODB_URI, log);

  const app = createApp(env, log);
  const server = createServer(app);

  let embeddedWorker: Worker | null = null;
  if (analysisQueueEnabled(env) && env.WORKER_EMBEDDED) {
    const cacheRedis =
      env.GEMINI_CACHE_TTL_SEC > 0 && env.REDIS_URL
        ? createDuplicateConnection(env.REDIS_URL)
        : null;
    embeddedWorker = createAnalysisWorker(env, log, cacheRedis);
    embeddedWorker.on("failed", (job, err) => {
      log.error({ jobId: job?.id, err }, "Embedded worker job failed");
    });
    log.info("Embedded BullMQ analysis worker started");
  }

  server.listen(env.PORT, () => {
    log.info({ port: env.PORT }, "Server listening");
  });

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, "Shutdown initiated");
    server.close(async () => {
      if (embeddedWorker) {
        await embeddedWorker.close();
      }
      await disconnectDatabase(log);
      process.exit(0);
    });
    setTimeout(() => {
      log.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

void bootstrap().catch((err: unknown) => {
  console.error("Fatal bootstrap error:", err);
  process.exit(1);
});
