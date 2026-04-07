import IORedis from "ioredis";

/**
 * BullMQ requires `maxRetriesPerRequest: null` on ioredis.
 */
export function createRedisConnection(redisUrl: string): IORedis {
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
  });
}

export function createDuplicateConnection(redisUrl: string): IORedis {
  return createRedisConnection(redisUrl);
}
