import { Router } from "express";
import type { Logger } from "pino";
import type { Env } from "../config/env.js";
import { createProjectEditorController } from "../controllers/projectEditor.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validate.js";
import {
  aiFixPreviewBodySchema,
  fileContentQuerySchema,
  projectIdParamSchema,
  pushChangesBodySchema,
  saveFileBodySchema,
} from "../validation/apiSchemas.js";

/**
 * Authenticated file editor + Git push (OAuth GitHub projects only).
 */
export function createProjectEditorRouter(env: Env, log: Logger): Router {
  const router = Router();
  const c = createProjectEditorController(env, log);

  router.get(
    "/projects/:projectId/file-content",
    requireAuth,
    validateParams(projectIdParamSchema),
    validateQuery(fileContentQuerySchema),
    (req, res, next) => {
      void c.getFileContent(req, res, next);
    },
  );

  router.post(
    "/projects/:projectId/save-file",
    requireAuth,
    validateParams(projectIdParamSchema),
    validateBody(saveFileBodySchema),
    (req, res, next) => {
      void c.saveFile(req, res, next);
    },
  );

  router.post(
    "/projects/:projectId/push-changes",
    requireAuth,
    validateParams(projectIdParamSchema),
    validateBody(pushChangesBodySchema),
    (req, res, next) => {
      void c.pushChanges(req, res, next);
    },
  );

  router.post(
    "/projects/:projectId/ai-fix-preview",
    requireAuth,
    validateParams(projectIdParamSchema),
    validateBody(aiFixPreviewBodySchema),
    (req, res, next) => {
      void c.postAiFixPreview(req, res, next);
    },
  );

  return router;
}
