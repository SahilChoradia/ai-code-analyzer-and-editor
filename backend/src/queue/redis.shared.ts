import type { Env } from "../config/env.js";
import type IORedis from "ioredis";
import { createRedisConnection } from "./redis.connection.js";

/** Optional singleton Redis for API-side Gemini cache (HTTP process). */
let apiRedis: IORedis | null = null;

export function getApiRedis(env: Env): IORedis | null {
  if (!env.REDIS_URL?.trim()) {
    return null;
  }
  if (!apiRedis) {
    apiRedis = createRedisConnection(env.REDIS_URL);
  }
  return apiRedis;
}
