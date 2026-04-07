import type { NextFunction, Request, Response } from "express";
import type { Logger } from "pino";
import mongoose from "mongoose";
import type { Env } from "../config/env.js";
import { HttpError } from "../middleware/errorHandler.js";
import type { IAiFileInsight, IProjectFile } from "../models/project.model.js";
import { Project } from "../models/project.model.js";
import type { IProjectAnalysis } from "../models/projectAnalysis.model.js";
import { ProjectAnalysis } from "../models/projectAnalysis.model.js";
import { generateAiFixPreview } from "../services/aiFixPreview.service.js";
import {
  pushProjectWorkspace,
  readProjectFileContent,
  saveProjectFileContent,
} from "../services/projectEditor.service.js";
import { sendSuccess } from "../utils/responseFormatter.js";

function requireSessionUser(req: Request): Express.User {
  const u = req.user;
  if (!u?.accessToken) {
    throw new HttpError(
      401,
      "Sign in with GitHub to use the code editor",
      "UNAUTHORIZED",
    );
  }
  return u;
}

export function createProjectEditorController(env: Env, log: Logger) {
  return {
    getFileContent: async (
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      try {
        const user = requireSessionUser(req);
        const projectId = req.params.projectId as string;
        const relPath = String((req.query as { path: string }).path);
        const data = await readProjectFileContent(
          env,
          projectId,
          user._id,
          user.accessToken,
          relPath,
          log,
        );
        sendSuccess(res, data, { message: "File loaded" });
      } catch (err) {
        next(err);
      }
    },

    saveFile: async (
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      try {
        const user = requireSessionUser(req);
        const projectId = req.params.projectId as string;
        const body = req.body as { path: string; content: string };
        const data = await saveProjectFileContent(
          env,
          projectId,
          user._id,
          user.accessToken,
          body.path,
          body.content,
          log,
        );
        sendSuccess(res, data, { message: "File saved" });
      } catch (err) {
        next(err);
      }
    },

    pushChanges: async (
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      try {
        const user = requireSessionUser(req);
        const projectId = req.params.projectId as string;
        const body = req.body as { message?: string; branch?: string };
        const data = await pushProjectWorkspace(
          env,
          projectId,
          user._id,
          user.accessToken,
          body.message ?? "",
          body.branch,
          log,
        );
        sendSuccess(res, data, { message: "Changes pushed to GitHub" });
      } catch (err) {
        next(err);
      }
    },

    postAiFixPreview: async (
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      try {
        const user = requireSessionUser(req);
        const projectId = req.params.projectId as string;
        const body = req.body as { path: string };

        if (!mongoose.isValidObjectId(projectId)) {
          throw new HttpError(400, "Invalid project id", "BAD_REQUEST");
        }

        const project = await Project.findById(projectId);
        if (!project) {
          throw new HttpError(404, "Project not found", "NOT_FOUND");
        }
        if (project.sourceType !== "github" || !project.userId) {
          throw new HttpError(
            400,
            "AI fix preview is only available for GitHub repositories you imported while signed in.",
            "EDITOR_UNAVAILABLE",
          );
        }
        if (!user._id.equals(project.userId)) {
          throw new HttpError(
            403,
            "You can only request previews for your own imported repositories.",
            "FORBIDDEN",
          );
        }

        const norm = body.path.replace(/\\/g, "/");
        const fileMeta = project.files.find(
          (f: IProjectFile) => f.path.replace(/\\/g, "/") === norm,
        );
        if (!fileMeta) {
          throw new HttpError(
            404,
            "File is not part of this project index",
            "NOT_FOUND",
          );
        }

        const analysisDoc = await ProjectAnalysis.findOne({
          projectId: project._id,
        }).lean<IProjectAnalysis | null>();
        const payload = analysisDoc?.data;
        const fileRow = payload?.files.find(
          (f) => f.path.replace(/\\/g, "/") === norm,
        );
        const smells = fileRow?.smells ?? [];
        const aiInsight =
          project.aiInsights?.find(
            (i: IAiFileInsight) =>
              i.filePath.replace(/\\/g, "/") === norm,
          ) ?? null;

        const data = await generateAiFixPreview({
          env,
          log,
          projectId,
          sessionUserId: user._id,
          accessToken: user.accessToken,
          filePath: norm,
          language: fileMeta.language,
          smells,
          aiInsight,
        });

        sendSuccess(res, data, { message: "Fix preview ready" });
      } catch (err) {
        next(err);
      }
    },
  };
}
