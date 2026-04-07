import { Router } from "express";
import type { Logger } from "pino";
import { requireAuth } from "../middleware/requireAuth.js";
import { listUserGithubRepos } from "../services/githubApi.service.js";
import { sendSuccess } from "../utils/responseFormatter.js";

/**
 * GET /repos — repositories visible to the signed-in GitHub user.
 */
export function createReposRouter(_log: Logger): Router {
  const router = Router();

  router.get("/repos", requireAuth, (req, res, next) => {
    void (async () => {
      try {
        const token = req.user!.accessToken;
        const repos = await listUserGithubRepos(token);
        sendSuccess(res, { repos }, { message: "Repositories loaded" });
      } catch (err) {
        next(err);
      }
    })();
  });

  return router;
}
