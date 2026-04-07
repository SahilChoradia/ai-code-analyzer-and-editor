import { Router } from "express";
import type { Logger } from "pino";
import passport from "passport";
import type { Env } from "../config/env.js";
import { sendSuccess } from "../utils/responseFormatter.js";

/**
 * GitHub OAuth start/callback, session user probe, logout.
 */
export function createAuthRouter(env: Env, log: Logger): Router {
  const router = Router();
  const frontend = env.FRONTEND_URL!;

  router.get(
    "/auth/github",
    passport.authenticate("github", { scope: ["read:user", "repo"] }),
  );

  router.get(
    "/auth/github/callback",
    passport.authenticate("github", {
      failureRedirect: `${frontend}/login?error=oauth`,
    }),
    (_req, res) => {
      res.redirect(`${frontend}/dashboard`);
    },
  );

  router.post("/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) {
        next(err);
        return;
      }
      req.session.destroy((e) => {
        if (e) {
          log.warn({ err: e }, "Session destroy failed");
        }
        res.clearCookie("ace.sid", { path: "/" });
        sendSuccess(res, { ok: true }, { message: "Signed out" });
      });
    });
  });

  router.get("/auth/me", (req, res) => {
    if (!req.isAuthenticated?.() || !req.user) {
      sendSuccess(
        res,
        { authenticated: false as const, user: null },
        { message: "Not signed in" },
      );
      return;
    }
    const u = req.user;
    sendSuccess(
      res,
      {
        authenticated: true as const,
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
