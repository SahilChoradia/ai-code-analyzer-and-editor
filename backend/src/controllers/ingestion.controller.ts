import type { NextFunction, Request, Response } from "express";
import type { Logger } from "pino";
import { HttpError } from "../middleware/errorHandler.js";
import type { IngestionService } from "../services/ingestion.service.js";
import { sendSuccess } from "../utils/responseFormatter.js";

/**
 * HTTP handlers for authenticated GitHub ingestion.
 */
export function createIngestionController(
  service: IngestionService,
  log: Logger,
) {
  return {
    /**
     * POST /ingest/github — OAuth-authenticated shallow clone (session user).
     */
    ingestGithubAuthenticated: async (
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      try {
        const user = req.user;
        if (!user?.accessToken) {
          throw new HttpError(401, "Not authenticated", "UNAUTHORIZED");
        }
        const { owner, repo } = req.body as { owner: string; repo: string };

        log.info(
          { owner, repo, userId: String(user._id) },
          "GitHub OAuth ingest",
        );

        const result = await service.ingestGithubAuthenticated(
          owner,
          repo,
          user.accessToken,
          user._id,
          log,
        );

        sendSuccess(res, result, {
          status: 201,
          message: "Repository ingested and processed",
        });
      } catch (err) {
        next(err);
      }
    },
  };
}
