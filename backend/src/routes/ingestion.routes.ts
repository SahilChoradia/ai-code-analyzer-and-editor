import { Router } from "express";
import type { Logger } from "pino";
import type { Env } from "../config/env.js";
import { createIngestionController } from "../controllers/ingestion.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validateBody } from "../middleware/validate.js";
import { IngestionService } from "../services/ingestion.service.js";
import { sendError } from "../utils/responseFormatter.js";
import { githubIngestBodySchema } from "../validation/apiSchemas.js";

/**
 * Authenticated GitHub clone + ingest (ZIP / public URL flows removed).
 */
export function createIngestionRouter(env: Env, log: Logger): Router {
  const router = Router();
  const service = new IngestionService(env);
  const controller = createIngestionController(service, log);

  router.post("/ingest/github", (_req, res, next) => {
    if (!env.githubOAuthEnabled) {
      sendError(
        res,
        503,
        "GitHub OAuth is not configured on this server",
        "SERVICE_UNAVAILABLE",
      );
      return;
    }
    next();
  });

  router.post(
    "/ingest/github",
    requireAuth,
    validateBody(githubIngestBodySchema),
    (req, res, next) => {
      void controller.ingestGithubAuthenticated(req, res, next);
    },
  );

  return router;
}
