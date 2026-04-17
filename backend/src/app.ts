import cors from "cors";
import express from "express";
import helmet from "helmet";
import passport from "passport";
import type { Logger } from "pino";
import pinoHttp from "pino-http";
import { createErrorHandler } from "./middleware/errorHandler.js";
import { notFoundHandler } from "./middleware/notFoundHandler.js";
import type { Env } from "./config/env.js";
import { configureGithubPassport } from "./config/passportGithub.js";
import { createSessionMiddleware } from "./config/session.js";
import { createApiRouter } from "./routes/index.js";

/**
 * Builds the Express application with security headers, logging, and routes.
 */
export function createApp(env: Env, log: Logger): express.Application {
  const app = express();

  app.disable("x-powered-by");
  // Always trust proxy in cloud environments (Render/Railway/Vercel)
  // This is required for secure cookies to work over HTTPS proxies
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_URL || true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));

  if (env.githubOAuthEnabled) {
    app.use(createSessionMiddleware(env));
    app.use(passport.initialize());
    app.use(passport.session());
    configureGithubPassport(env);
  }

  app.use(
    pinoHttp({
      logger: log,
      autoLogging: {
        ignore: (req) => req.url === "/health" || req.url === "/ready",
      },
    }),
  );

  app.use(createApiRouter(env, log));
  app.use(notFoundHandler);
  app.use(createErrorHandler(log));

  return app;
}
