import mongoose from "mongoose";
import { z } from "zod";

/**
 * Shared Zod schemas for API validation (STEP 5).
 */

export const githubRepoBodySchema = z.object({
  repoUrl: z
    .string()
    .trim()
    .min(1, "repoUrl is required")
    .max(2048, "repoUrl is too long")
    .url("repoUrl must be a valid URL"),
});

const githubOwner = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(
    /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/,
    "Invalid GitHub owner",
  );

const githubRepoName = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9_.-]+$/, "Invalid repository name");

/** POST /ingest/github — authenticated clone + ingest */
export const githubIngestBodySchema = z.object({
  owner: githubOwner,
  repo: githubRepoName,
});

export const analyzeBodySchema = z.object({
  projectId: z
    .string()
    .trim()
    .min(1, "projectId is required")
    .max(64, "projectId is too long")
    .refine((id) => mongoose.isValidObjectId(id), {
      message: "projectId must be a valid MongoDB ObjectId",
    }),
});

const objectIdRefine = (message: string) =>
  z.string().min(1).refine((id) => mongoose.isValidObjectId(id), { message });

/** Route param for `GET /results/:id` */
export const resultsIdParamSchema = z.object({
  id: objectIdRefine("id must be a valid MongoDB ObjectId"),
});

/** Route param for `GET /projects/:projectId/analysis` and `GET /projects/:projectId` */
export const projectIdParamSchema = z.object({
  projectId: objectIdRefine(
    "projectId must be a valid MongoDB ObjectId",
  ),
});

/** GET /projects/:projectId/file-content */
export const fileContentQuerySchema = z.object({
  path: z.string().trim().min(1, "path is required").max(4096),
});

/** POST /projects/:projectId/save-file */
export const saveFileBodySchema = z.object({
  path: z.string().trim().min(1).max(4096),
  content: z.string().max(1_800_000),
});

/** POST /projects/:projectId/push-changes */
export const pushChangesBodySchema = z.object({
  message: z.string().trim().max(500).optional(),
  branch: z
    .string()
    .trim()
    .max(200)
    .regex(
      /^[a-zA-Z0-9/_-]*$/,
      "branch may only contain letters, digits, /, _, -",
    )
    .optional(),
});

/** POST /projects/:projectId/ai-fix-preview */
export const aiFixPreviewBodySchema = z.object({
  path: z.string().trim().min(1).max(4096),
});
