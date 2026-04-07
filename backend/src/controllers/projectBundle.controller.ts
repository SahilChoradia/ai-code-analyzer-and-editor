import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../middleware/errorHandler.js";
import { loadProjectBundle } from "../services/projectBundle.service.js";
import { sendSuccess } from "../utils/responseFormatter.js";

/**
 * GET /projects/:projectId and GET /results/:id — unified project bundle payload.
 */
export function createProjectBundleController() {
  return {
    get: async (
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      try {
        const raw = req.params.id ?? req.params.projectId;
        const id = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
        if (!id) {
          throw new HttpError(400, "Missing project identifier", "BAD_REQUEST");
        }

        const bundle = await loadProjectBundle(id);
        if (!bundle) {
          throw new HttpError(404, "Project not found", "NOT_FOUND");
        }

        sendSuccess(res, bundle, {
          message: "Project results loaded",
        });
      } catch (err) {
        next(err);
      }
    },
  };
}
