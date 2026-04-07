import type { Response } from "express";

/**
 * Standard API success envelope (STEP 5).
 */
export function sendSuccess(
  res: Response,
  data: unknown,
  options?: { status?: number; message?: string },
): void {
  const status = options?.status ?? 200;
  const body: {
    success: true;
    data: unknown;
    message?: string;
  } = {
    success: true,
    data,
  };
  if (options?.message) {
    body.message = options.message;
  }
  res.status(status).json(body);
}

/**
 * Standard API error envelope for non-middleware use (e.g. rate limit handler).
 */
export function sendError(
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
