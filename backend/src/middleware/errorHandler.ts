import type { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";
import type { Logger } from "pino";
import { ZodError } from "zod";

const DEFAULT_CODE_BY_STATUS: Partial<Record<number, string>> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  422: "UNPROCESSABLE_ENTITY",
  429: "TOO_MANY_REQUESTS",
  500: "INTERNAL_ERROR",
  502: "BAD_GATEWAY",
  503: "SERVICE_UNAVAILABLE",
  504: "GATEWAY_TIMEOUT",
};

/**
 * Express error shape with HTTP status and machine-readable `code` (STEP 5).
 */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code ?? DEFAULT_CODE_BY_STATUS[statusCode] ?? "HTTP_ERROR";
  }
}

function sendStandardError(
  res: Response,
  status: number,
  message: string,
  code: string,
): void {
  res.status(status).json({
    success: false,
    error: {
      message,
      code,
    },
  });
}

/**
 * Global error middleware — structured JSON for all failures (STEP 5).
 */
export function createErrorHandler(log: Logger) {
  return (
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ): void => {
    if (err instanceof ZodError) {
      const message = err.issues.map((i) => i.message).join("; ");
      log.warn({ err }, "Zod validation error");
      sendStandardError(res, 400, message || "Validation failed", "VALIDATION_ERROR");
      return;
    }

    if (err instanceof MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        log.warn({ err }, "Upload too large");
        sendStandardError(
          res,
          413,
          "File exceeds maximum upload size",
          "PAYLOAD_TOO_LARGE",
        );
        return;
      }
      log.warn({ err }, "Multipart upload error");
      sendStandardError(
        res,
        400,
        err.message || "Invalid file upload",
        "MULTIPART_ERROR",
      );
      return;
    }

    const status =
      err instanceof HttpError
        ? err.statusCode
        : /* istanbul ignore next */ 500;
    const message =
      err instanceof Error ? err.message : "Internal Server Error";
    const code =
      err instanceof HttpError
        ? err.code
        : DEFAULT_CODE_BY_STATUS[500] ?? "INTERNAL_ERROR";

    if (status >= 500) {
      log.error({ err }, "Unhandled error");
    } else {
      log.warn({ err }, "Request error");
    }

    sendStandardError(res, status, message, code);
  };
}
