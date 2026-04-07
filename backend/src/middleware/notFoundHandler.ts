import type { Request, Response } from "express";
import { sendError } from "../utils/responseFormatter.js";

/**
 * 404 handler for undefined routes (STEP 5 standard envelope).
 */
export function notFoundHandler(_req: Request, res: Response): void {
  sendError(res, 404, "Not Found", "NOT_FOUND");
}
