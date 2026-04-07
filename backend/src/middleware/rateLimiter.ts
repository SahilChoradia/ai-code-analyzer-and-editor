import rateLimit from "express-rate-limit";
import type { Env } from "../config/env.js";
import { sendError } from "../utils/responseFormatter.js";

/**
 * Basic API rate limiter (STEP 5). Health routes should not use this middleware.
 */
export function createApiRateLimiter(env: Env) {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      sendError(
        res,
        429,
        "Too many requests. Please try again later.",
        "RATE_LIMIT_EXCEEDED",
      );
    },
  });
}
