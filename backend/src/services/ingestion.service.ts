import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Logger } from "pino";
import type { Types } from "mongoose";
import type { Env } from "../config/env.js";
import { HttpError } from "../middleware/errorHandler.js";
import { FileAst } from "../models/fileAst.model.js";
import { ProjectAnalysis } from "../models/projectAnalysis.model.js";
import { Project } from "../models/project.model.js";
import { AnalysisService } from "./analysis.service.js";
import { AstService } from "./ast.service.js";
import { assertGithubRepoAccessible } from "./githubApi.service.js";
import { scanDirectory } from "../utils/fileScanner.js";
import {
  buildAuthenticatedGithubCloneUrl,
  cloneGithubRepo,
  normalizeGithubCloneUrl,
} from "../utils/githubCloner.js";
import { extractZipSafely } from "../utils/zipExtractor.js";
import { analysisQueueEnabled, enqueueProjectAnalysis } from "../queue/analysis.queue.js";

export interface IngestionResult {
  projectId: string;
  fileCount: number;
  /** Legacy field: ingestion + AST stored; final `Project.status` may be `analyzed`. */
  status: "uploaded";
  /** True when STEP 4 analysis completed and was persisted. */
  analyzed: boolean;
}

/**
 * Removes a temporary workspace; logs but does not throw on failure.
 */
async function safeRemoveDir(dir: string, log: Logger): Promise<void> {
  try {
    await rm(dir, { recursive: true, force: true });
  } catch (err: unknown) {
    log.warn({ err, dir }, "Failed to remove temporary ingestion directory");
  }
}

function tempRoot(env: Env): string {
  return env.INGEST_TEMP_ROOT?.trim() || os.tmpdir();
}

function projectNameFromZip(originalName: string): string {
  const ext = path.extname(originalName);
  const base = ext ? path.basename(originalName, ext) : originalName;
  const cleaned = base.replace(/[^\w.-]+/g, "-").slice(0, 120);
  return cleaned.length > 0 ? cleaned : "zip-upload";
}

function projectNameFromCloneUrl(cloneUrl: string): string {
  const match = cloneUrl.match(/github\.com\/([^/]+)\/([^/.]+)/i);
  if (match) {
    return `${match[1]}-${match[2]}`.slice(0, 120);
  }
  return "github-repo";
}

function displayRepoUrl(cloneUrl: string): string {
  return cloneUrl.replace(/\.git$/i, "");
}

/**
 * Orchestrates ZIP and GitHub ingestion: extract/clone, scan, AST parse, persist, cleanup.
 */
export class IngestionService {
  private readonly astService: AstService;
  private readonly analysisService: AnalysisService;

  constructor(private readonly env: Env) {
    this.astService = new AstService(env);
    this.analysisService = new AnalysisService(env);
  }

  /**
   * Ingests a ZIP from memory: extracts to a temp directory, scans, parses ASTs, saves Project, deletes temp data.
   */
  async ingestZip(
    zipBuffer: Buffer,
    originalFilename: string,
    log: Logger,
  ): Promise<IngestionResult> {
    const root = tempRoot(this.env);
    const workDir = await mkdtemp(path.join(root, "ace-ingest-"));
    const extractDir = path.join(workDir, "extracted");

    try {
      await extractZipSafely(zipBuffer, extractDir);
      const files = await scanDirectory(extractDir);

      if (files.length === 0) {
        throw new HttpError(
          400,
          "No supported source files found in archive",
        );
      }

      const doc = await Project.create({
        name: projectNameFromZip(originalFilename),
        sourceType: "zip",
        files,
        status: "processing",
      });

      try {
        const ast = await this.astService.parseAndPersist(
          doc._id,
          extractDir,
          files,
          log,
        );
        await Project.findByIdAndUpdate(doc._id, {
          status: "uploaded",
          ast,
        });

        if (analysisQueueEnabled(this.env) && this.env.QUEUE_AFTER_INGEST) {
          try {
            const { jobId } = await enqueueProjectAnalysis(
              this.env,
              String(doc._id),
            );
            await Project.findByIdAndUpdate(doc._id, {
              status: "queued",
              analysisJobId: jobId,
            });
            log.info(
              { projectId: String(doc._id), jobId },
              "Analysis queued after ZIP ingest",
            );
          } catch (err: unknown) {
            log.error(
              { err, projectId: String(doc._id) },
              "Failed to queue analysis after ingest",
            );
          }
        } else {
          try {
            const payload = await this.analysisService.analyzeAndPersist(
              doc._id,
              files.map((f) => f.path),
              log,
            );
            if (payload) {
              await Project.findByIdAndUpdate(doc._id, { status: "completed" });
            }
          } catch (err: unknown) {
            log.warn(
              { err, projectId: String(doc._id) },
              "Static analysis failed; project left at uploaded",
            );
          }
        }
      } catch (err: unknown) {
        await FileAst.deleteMany({ projectId: doc._id });
        await ProjectAnalysis.deleteMany({ projectId: doc._id });
        await Project.findByIdAndDelete(doc._id);
        throw err;
      }

      const finalDoc = await Project.findById(doc._id).lean<{
        status: string;
      } | null>();
      const analyzed =
        finalDoc?.status === "completed" ||
        finalDoc?.status === "analyzed";

      return {
        projectId: String(doc._id),
        fileCount: files.length,
        status: "uploaded",
        analyzed,
      };
    } finally {
      await safeRemoveDir(workDir, log);
    }
  }

  /**
   * Clones a public GitHub repo shallowly, scans supported files, parses ASTs, saves Project, deletes temp data.
   */
  async ingestGithub(repoUrl: string, log: Logger): Promise<IngestionResult> {
    const cloneUrl = normalizeGithubCloneUrl(repoUrl);
    const root = tempRoot(this.env);
    const workDir = await mkdtemp(path.join(root, "ace-github-"));

    try {
      await cloneGithubRepo(
        cloneUrl,
        workDir,
        log,
        this.env.GITHUB_CLONE_TIMEOUT_MS,
      );

      const files = await scanDirectory(workDir);

      if (files.length === 0) {
        throw new HttpError(
          400,
          "No supported source files found in repository",
        );
      }

      const doc = await Project.create({
        name: projectNameFromCloneUrl(cloneUrl),
        sourceType: "github",
        repoUrl: displayRepoUrl(cloneUrl),
        files,
        status: "processing",
      });

      try {
        const ast = await this.astService.parseAndPersist(
          doc._id,
          workDir,
          files,
          log,
        );
        await Project.findByIdAndUpdate(doc._id, {
          status: "uploaded",
          ast,
        });

        if (analysisQueueEnabled(this.env) && this.env.QUEUE_AFTER_INGEST) {
          try {
            const { jobId } = await enqueueProjectAnalysis(
              this.env,
              String(doc._id),
            );
            await Project.findByIdAndUpdate(doc._id, {
              status: "queued",
              analysisJobId: jobId,
            });
            log.info(
              { projectId: String(doc._id), jobId },
              "Analysis queued after GitHub ingest",
            );
          } catch (err: unknown) {
            log.error(
              { err, projectId: String(doc._id) },
              "Failed to queue analysis after ingest",
            );
          }
        } else {
          try {
            const payload = await this.analysisService.analyzeAndPersist(
              doc._id,
              files.map((f) => f.path),
              log,
            );
            if (payload) {
              await Project.findByIdAndUpdate(doc._id, { status: "completed" });
            }
          } catch (err: unknown) {
            log.warn(
              { err, projectId: String(doc._id) },
              "Static analysis failed; project left at uploaded",
            );
          }
        }
      } catch (err: unknown) {
        await FileAst.deleteMany({ projectId: doc._id });
        await ProjectAnalysis.deleteMany({ projectId: doc._id });
        await Project.findByIdAndDelete(doc._id);
        throw err;
      }

      const finalDoc = await Project.findById(doc._id).lean<{
        status: string;
      } | null>();
      const analyzed =
        finalDoc?.status === "completed" ||
        finalDoc?.status === "analyzed";

      return {
        projectId: String(doc._id),
        fileCount: files.length,
        status: "uploaded",
        analyzed,
      };
    } finally {
      await safeRemoveDir(workDir, log);
    }
  }

  /**
   * Clones a GitHub repository using the user's OAuth token (private repos allowed).
   */
  async ingestGithubAuthenticated(
    owner: string,
    repo: string,
    accessToken: string,
    userId: Types.ObjectId,
    log: Logger,
  ): Promise<IngestionResult> {
    const o = owner.trim();
    const r = repo.trim();
    if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(o)) {
      throw new HttpError(400, "Invalid repository owner", "BAD_REQUEST");
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(r)) {
      throw new HttpError(400, "Invalid repository name", "BAD_REQUEST");
    }

    await assertGithubRepoAccessible(o, r, accessToken);

    const httpsUrl = `https://github.com/${o}/${r}.git`;
    const cloneUrl = buildAuthenticatedGithubCloneUrl(httpsUrl, accessToken);
    const root = tempRoot(this.env);
    const workDir = await mkdtemp(path.join(root, "ace-github-oauth-"));

    try {
      await cloneGithubRepo(
        cloneUrl,
        workDir,
        log,
        this.env.GITHUB_CLONE_TIMEOUT_MS,
      );

      const files = await scanDirectory(workDir);

      if (files.length === 0) {
        throw new HttpError(
          400,
          "No supported source files found in repository",
        );
      }

      const doc = await Project.create({
        name: `${o}-${r}`.slice(0, 120),
        sourceType: "github",
        repoUrl: `https://github.com/${o}/${r}`,
        userId,
        files,
        status: "processing",
      });

      try {
        const ast = await this.astService.parseAndPersist(
          doc._id,
          workDir,
          files,
          log,
        );
        await Project.findByIdAndUpdate(doc._id, {
          status: "uploaded",
          ast,
        });

        if (analysisQueueEnabled(this.env) && this.env.QUEUE_AFTER_INGEST) {
          try {
            const { jobId } = await enqueueProjectAnalysis(
              this.env,
              String(doc._id),
            );
            await Project.findByIdAndUpdate(doc._id, {
              status: "queued",
              analysisJobId: jobId,
            });
            log.info(
              { projectId: String(doc._id), jobId },
              "Analysis queued after GitHub OAuth ingest",
            );
          } catch (err: unknown) {
            log.error(
              { err, projectId: String(doc._id) },
              "Failed to queue analysis after ingest",
            );
          }
        } else {
          try {
            const payload = await this.analysisService.analyzeAndPersist(
              doc._id,
              files.map((f) => f.path),
              log,
            );
            if (payload) {
              await Project.findByIdAndUpdate(doc._id, { status: "completed" });
            }
          } catch (err: unknown) {
            log.warn(
              { err, projectId: String(doc._id) },
              "Static analysis failed; project left at uploaded",
            );
          }
        }
      } catch (err: unknown) {
        await FileAst.deleteMany({ projectId: doc._id });
        await ProjectAnalysis.deleteMany({ projectId: doc._id });
        await Project.findByIdAndDelete(doc._id);
        throw err;
      }

      const finalDoc = await Project.findById(doc._id).lean<{
        status: string;
      } | null>();
      const analyzed =
        finalDoc?.status === "completed" ||
        finalDoc?.status === "analyzed";

      return {
        projectId: String(doc._id),
        fileCount: files.length,
        status: "uploaded",
        analyzed,
      };
    } finally {
      await safeRemoveDir(workDir, log);
    }
  }
}
