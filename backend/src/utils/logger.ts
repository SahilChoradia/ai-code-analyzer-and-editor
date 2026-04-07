import pino from "pino";
import type { Env } from "../config/env.js";

/**
 * Creates a root Pino logger configured from environment.
 */
export function createLogger(env: Env): pino.Logger {
  const isDev = env.NODE_ENV === "development";

  return pino({
    level: env.LOG_LEVEL,
    transport: isDev
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        }
      : undefined,
    base: {
      env: env.NODE_ENV,
    },
  });
}
