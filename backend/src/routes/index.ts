import { Router } from "express";
import type { Logger } from "pino";
import type { Env } from "../config/env.js";
import { createApiRateLimiter } from "../middleware/rateLimiter.js";
import { createAnalysisRouter } from "./analysis.routes.js";
import { createAuthRouter } from "./auth.routes.js";
import { createHealthRouter } from "./health.routes.js";
import { createIngestionRouter } from "./ingestion.routes.js";
import { createProjectEditorRouter } from "./projectEditor.routes.js";
import { createProjectRouter } from "./project.routes.js";
import { createReposRouter } from "./repos.routes.js";
import { createResultsRouter } from "./results.routes.js";

/**
 * Root API router — health + auth without heavy rate limit; mutating routes throttled.
 */
export function createApiRouter(env: Env, log: Logger): Router {
  const root = Router();

  root.use(createHealthRouter());

  if (env.githubOAuthEnabled) {
    root.use(createAuthRouter(env, log));
  }

  const guarded = Router();
  guarded.use(createApiRateLimiter(env));
  if (env.githubOAuthEnabled) {
    guarded.use(createReposRouter(log));
  }
  guarded.use(createIngestionRouter(env, log));
  guarded.use(createAnalysisRouter(env, log));
  guarded.use(createProjectRouter());
  if (env.githubOAuthEnabled) {
    guarded.use(createProjectEditorRouter(env, log));
  }
  guarded.use(createResultsRouter());

  root.use(guarded);
  return root;
}
