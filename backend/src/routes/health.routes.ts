import { Router } from "express";
import mongoose from "mongoose";
import { sendError, sendSuccess } from "../utils/responseFormatter.js";

/**
 * Health and readiness probes for orchestration and monitoring (STEP 5 envelope).
 */
export function createHealthRouter(): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    sendSuccess(
      res,
      {
        status: "ok",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
      { message: "Service is healthy" },
    );
  });

  router.get("/ready", (_req, res) => {
    const state = mongoose.connection.readyState;
    const ready = state === 1;
    if (!ready) {
      sendError(
        res,
        503,
        "Database connection is not ready",
        "SERVICE_UNAVAILABLE",
      );
      return;
    }
    sendSuccess(
      res,
      { ready: true, db: "connected" },
      { message: "Service is ready" },
    );
  });

  return router;
}
