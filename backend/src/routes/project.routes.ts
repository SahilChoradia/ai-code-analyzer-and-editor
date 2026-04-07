import { Router } from "express";
import { createProjectBundleController } from "../controllers/projectBundle.controller.js";
import { validateParams } from "../middleware/validate.js";
import { projectIdParamSchema } from "../validation/apiSchemas.js";

/**
 * Project read API (canonical path; mirrors GET /results/:id).
 */
export function createProjectRouter(): Router {
  const router = Router();
  const controller = createProjectBundleController();

  router.get(
    "/projects/:projectId",
    validateParams(projectIdParamSchema),
    (req, res, next) => {
      void controller.get(req, res, next);
    },
  );

  return router;
}
