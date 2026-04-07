import { Router } from "express";
import type { Logger } from "pino";
import type { Env } from "../config/env.js";
import { createAnalysisController } from "../controllers/analysis.controller.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { analyzeBodySchema, projectIdParamSchema } from "../validation/apiSchemas.js";

/**
 * STEP 4/5 analysis API.
 */
export function createAnalysisRouter(env: Env, log: Logger): Router {
  const router = Router();
  const controller = createAnalysisController(env, log);

  router.post(
    "/analyze",
    validateBody(analyzeBodySchema),
    (req, res, next) => {
      void controller.postAnalyze(req, res, next);
    },
  );

  router.get(
    "/projects/:projectId/analysis",
    validateParams(projectIdParamSchema),
    (req, res, next) => {
      void controller.getAnalysis(req, res, next);
    },
  );

  router.get(
    "/projects/:projectId/analysis-progress",
    validateParams(projectIdParamSchema),
    (req, res, next) => {
      void controller.getAnalysisProgress(req, res, next);
    },
  );

  return router;
}
