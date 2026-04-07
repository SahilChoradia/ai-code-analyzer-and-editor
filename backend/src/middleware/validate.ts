import type { NextFunction, Request, Response } from "express";
import type { ZodError, ZodTypeAny } from "zod";
import { HttpError } from "./errorHandler.js";

/**
 * Flattens Zod issues into a single human-readable message.
 */
export function formatZodError(error: ZodError): string {
  return error.issues.map((i) => i.message).join("; ");
}

/**
 * Validates `req.body` and replaces it with the parsed output (sanitized).
 */
export function validateBody(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      next(
        new HttpError(
          400,
          formatZodError(parsed.error),
          "VALIDATION_ERROR",
        ),
      );
      return;
    }
    req.body = parsed.data;
    next();
  };
}

/**
 * Validates `req.params` and merges parsed values back onto `req.params`.
 */
export function validateParams(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.params);
    if (!parsed.success) {
      next(
        new HttpError(
          400,
          formatZodError(parsed.error),
          "VALIDATION_ERROR",
        ),
      );
      return;
    }
    Object.assign(req.params, parsed.data);
    next();
  };
}

/**
 * Validates `req.query` and assigns parsed values to `req.query`.
 */
export function validateQuery(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      next(
        new HttpError(
          400,
          formatZodError(parsed.error),
          "VALIDATION_ERROR",
        ),
      );
      return;
    }
    req.query = parsed.data as Request["query"];
    next();
  };
}
