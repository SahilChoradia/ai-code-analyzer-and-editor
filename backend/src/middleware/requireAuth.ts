import type { NextFunction, Request, Response } from "express";
import { sendError } from "../utils/responseFormatter.js";

/**
 * Requires an authenticated Passport session (GitHub OAuth).
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.isAuthenticated?.() && req.user?.accessToken) {
    next();
    return;
  }
  sendError(
    res,
    401,
    "Sign in with GitHub to continue",
    "UNAUTHORIZED",
  );
}
