import { Router, type Request, type Response, type NextFunction } from "express";
import type { Logger } from "pino";
import passport from "passport";
import type { Env } from "../config/env.js";
import { sendSuccess } from "../utils/responseFormatter.js";
import type { IUserDocument } from "../models/user.model.js";

/**
 * GitHub OAuth start/callback, session user probe, logout.
 */
export function createAuthRouter(env: Env, log: Logger): Router {
  const router = Router();
  const frontend = env.FRONTEND_URL!;

  // GitHub Auth Start
  router.get(
    "/auth/github",
    passport.authenticate("github", { scope: ["read:user", "repo"] }),
  );

  // GitHub Auth Callback
  router.get(
    "/auth/github/callback",
    passport.authenticate("github", {
      failureRedirect: `${frontend}/login?error=oauth`,
    }),
    (_req: Request, res: Response) => {
      log.info("GitHub OAuth successful, redirecting to dashboard");
      res.redirect(`${frontend}/dashboard`);
    },
  );

  // Logout
  router.post("/auth/logout", (req: Request, res: Response, next: NextFunction) => {
    req.logout((err: unknown) => {
      if (err) {
        next(err);
        return;
      }
      if (req.session) {
        req.session.destroy((e: unknown) => {
          if (e) {
            log.warn({ err: e }, "Session destroy failed");
          }
          res.clearCookie("ace.sid", { path: "/" });
          sendSuccess(res, { ok: true }, { message: "Signed out" });
        });
      } else {
        res.clearCookie("ace.sid", { path: "/" });
        sendSuccess(res, { ok: true }, { message: "Signed out" });
      }
    });
  });

  // Me (Session Probe)
  router.get("/auth/me", (req: Request, res: Response) => {
    if (!req.isAuthenticated() || !req.user) {
      sendSuccess(
        res,
        { authenticated: false, user: null },
        { message: "Not signed in" },
      );
      return;
    }

    const u = req.user as IUserDocument;
    sendSuccess(
      res,
      {
        authenticated: true,
        user: {
          id: String(u._id),
          username: u.username,
          displayName: u.displayName,
          avatar: u.avatar,
        },
      },
      { message: "Session active" },
    );
  });

  return router;
}
