import { Router } from "express";
import { createProjectBundleController } from "../controllers/projectBundle.controller.js";
import { validateParams } from "../middleware/validate.js";
import { resultsIdParamSchema } from "../validation/apiSchemas.js";

/**
 * GET /results/:id — standardized project bundle (STEP 5).
 */
export function createResultsRouter(): Router {
  const router = Router();
  const controller = createProjectBundleController();

  router.get(
    "/results/:id",
    validateParams(resultsIdParamSchema),
    (req, res, next) => {
      void controller.get(req, res, next);
    },
  );

  return router;
}
