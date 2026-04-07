import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Logger } from "pino";
import mongoose from "mongoose";
import simpleGit, { type SimpleGit } from "simple-git";
import type { Env } from "../config/env.js";
import { HttpError } from "../middleware/errorHandler.js";
import { Project } from "../models/project.model.js";
import {
  buildAuthenticatedGithubCloneUrl,
  cloneGithubRepo,
} from "../utils/githubCloner.js";

const MAX_SAVE_BYTES = Math.floor(1.75 * 1024 * 1024);

async function ensureLocalGitIdentity(git: SimpleGit): Promise<void> {
  await git.addConfig("user.name", "AI Code Engine", false, "local");
  await git.addConfig("user.email", "ace-editor@users.noreply.local", false, "local");
}

function editWorkspaceBase(env: Env): string {
  const raw = env.PROJECT_EDIT_WORKSPACE_ROOT?.trim();
  if (raw) {
    return raw;
  }
  return path.join(os.tmpdir(), "ace-edit-workspaces");
}

export function parseGithubRepoFromDisplayUrl(
  repoUrl: string,
): { owner: string; repo: string } | null {
  try {
    const u = new URL(repoUrl.trim());
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "github.com") {
      return null;
    }
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) {
      return null;
    }
    const owner = parts[0]!;
    let repo = parts[1]!;
    if (repo.endsWith(".git")) {
      repo = repo.slice(0, -4);
    }
    if (
      !/^[a-zA-Z0-9_.-]+$/.test(owner) ||
      !/^[a-zA-Z0-9_.-]+$/.test(repo)
    ) {
      return null;
    }
    return { owner, repo };
  } catch {
    return null;
  }
}

function toPosixRel(p: string): string {
  return p
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "");
}

function allowedPathsFromProject(
  files: Array<{ path: string }>,
): Set<string> {
  const s = new Set<string>();
  for (const f of files) {
    const r = toPosixRel(f.path);
    if (r) {
      s.add(r);
    }
  }
  return s;
}

/**
 * Resolves a repo-relative path inside workspace; must match project file index.
 */
export function resolveEditableFilePath(
  workspaceRoot: string,
  relativePath: string,
  allowedRelativePaths: Set<string>,
): string {
  const rel = toPosixRel(relativePath);
  if (!rel || rel.includes("..")) {
    throw new HttpError(400, "Invalid file path", "BAD_REQUEST");
  }
  const full = path.resolve(workspaceRoot, rel);
  const rootResolved = path.resolve(workspaceRoot);
  const prefix =
    rootResolved.endsWith(path.sep) ? rootResolved : `${rootResolved}${path.sep}`;
  if (full !== rootResolved && !full.startsWith(prefix)) {
    throw new HttpError(400, "Path escapes workspace", "BAD_REQUEST");
  }
  if (!allowedRelativePaths.has(rel)) {
    throw new HttpError(
      403,
      "File is not part of this project's analyzed file list",
      "FORBIDDEN",
    );
  }
  return full;
}

async function loadEditableProject(
  projectId: string,
  sessionUserId: mongoose.Types.ObjectId,
) {
  if (!mongoose.isValidObjectId(projectId)) {
    throw new HttpError(400, "Invalid project id", "BAD_REQUEST");
  }
  const project = await Project.findById(projectId);
  if (!project) {
    throw new HttpError(404, "Project not found", "NOT_FOUND");
  }
  if (project.sourceType !== "github" || !project.repoUrl?.trim()) {
    throw new HttpError(
      400,
      "Code editing is only available for GitHub repositories imported while signed in.",
      "EDITOR_UNAVAILABLE",
    );
  }
  if (!project.userId || !sessionUserId.equals(project.userId)) {
    throw new HttpError(
      403,
      "You can only edit repositories you imported with your GitHub account.",
      "FORBIDDEN",
    );
  }
  return project;
}

export async function ensureEditWorkspace(
  env: Env,
  projectId: string,
  sessionUserId: mongoose.Types.ObjectId,
  accessToken: string,
  log: Logger,
): Promise<{
  workspaceRoot: string;
  slug: { owner: string; repo: string };
  allowedPaths: Set<string>;
}> {
  const project = await loadEditableProject(projectId, sessionUserId);
  const slug = parseGithubRepoFromDisplayUrl(project.repoUrl!);
  if (!slug) {
    throw new HttpError(400, "Invalid stored repository URL", "BAD_REQUEST");
  }

  const allowedPaths = allowedPathsFromProject(project.files ?? []);
  if (allowedPaths.size === 0) {
    throw new HttpError(
      400,
      "This project has no indexed source files to edit.",
      "BAD_REQUEST",
    );
  }

  const base = editWorkspaceBase(env);
  await mkdir(base, { recursive: true });

  const targetDir = path.join(base, projectId);

  if (project.editWorkspacePath) {
    try {
      await access(project.editWorkspacePath);
      return {
        workspaceRoot: project.editWorkspacePath,
        slug,
        allowedPaths,
      };
    } catch {
      project.editWorkspacePath = undefined;
      await project.save();
    }
  }

  await rm(targetDir, { recursive: true, force: true });

  const httpsUrl = `https://github.com/${slug.owner}/${slug.repo}.git`;
  const cloneUrl = buildAuthenticatedGithubCloneUrl(httpsUrl, accessToken);
  await cloneGithubRepo(
    cloneUrl,
    targetDir,
    log,
    env.GITHUB_CLONE_TIMEOUT_MS,
  );

  const git = simpleGit(targetDir);
  await ensureLocalGitIdentity(git);
  await git.remote(["set-url", "origin", httpsUrl]);

  project.editWorkspacePath = targetDir;
  await project.save();

  return { workspaceRoot: targetDir, slug, allowedPaths };
}

export async function readProjectFileContent(
  env: Env,
  projectId: string,
  sessionUserId: mongoose.Types.ObjectId,
  accessToken: string,
  relativePath: string,
  log: Logger,
): Promise<{ content: string; path: string }> {
  const { workspaceRoot, allowedPaths } = await ensureEditWorkspace(
    env,
    projectId,
    sessionUserId,
    accessToken,
    log,
  );
  const full = resolveEditableFilePath(
    workspaceRoot,
    relativePath,
    allowedPaths,
  );
  const buf = await readFile(full);
  if (buf.includes(0)) {
    throw new HttpError(
      415,
      "Binary files cannot be edited in the browser",
      "UNSUPPORTED_MEDIA",
    );
  }
  return { content: buf.toString("utf8"), path: toPosixRel(relativePath) };
}

export async function saveProjectFileContent(
  env: Env,
  projectId: string,
  sessionUserId: mongoose.Types.ObjectId,
  accessToken: string,
  relativePath: string,
  content: string,
  log: Logger,
): Promise<{ path: string; bytesWritten: number }> {
  const { workspaceRoot, allowedPaths } = await ensureEditWorkspace(
    env,
    projectId,
    sessionUserId,
    accessToken,
    log,
  );
  const full = resolveEditableFilePath(
    workspaceRoot,
    relativePath,
    allowedPaths,
  );
  const buf = Buffer.from(content, "utf8");
  if (buf.length > MAX_SAVE_BYTES) {
    throw new HttpError(
      413,
      `File content exceeds ${MAX_SAVE_BYTES} bytes`,
      "PAYLOAD_TOO_LARGE",
    );
  }
  await writeFile(full, buf, "utf8");
  return { path: toPosixRel(relativePath), bytesWritten: buf.length };
}

export async function pushProjectWorkspace(
  env: Env,
  projectId: string,
  sessionUserId: mongoose.Types.ObjectId,
  accessToken: string,
  message: string,
  newBranch: string | undefined,
  log: Logger,
): Promise<{ branch: string; commitSha: string }> {
  const { workspaceRoot, slug } = await ensureEditWorkspace(
    env,
    projectId,
    sessionUserId,
    accessToken,
    log,
  );

  const git = simpleGit(workspaceRoot);
  await ensureLocalGitIdentity(git);
  const status = await git.status();
  if (!status.files || status.files.length === 0) {
    throw new HttpError(
      400,
      "No changes to commit. Save edits to files first.",
      "NOTHING_TO_COMMIT",
    );
  }

  const httpsUrl = `https://github.com/${slug.owner}/${slug.repo}.git`;
  const authUrl = buildAuthenticatedGithubCloneUrl(httpsUrl, accessToken);

  let branch = (await git.branch()).current;
  if (newBranch?.trim()) {
    const nb = newBranch
      .trim()
      .replace(/[^a-zA-Z0-9/_-]/g, "-")
      .slice(0, 200);
    if (!nb) {
      throw new HttpError(400, "Invalid branch name", "BAD_REQUEST");
    }
    try {
      await git.checkoutLocalBranch(nb);
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : String(err);
      if (/already exists/i.test(m)) {
        throw new HttpError(
          409,
          `A local branch named "${nb}" already exists. Choose another name or delete that branch in the workspace.`,
          "BRANCH_EXISTS",
        );
      }
      throw err;
    }
    branch = nb;
  }

  await git.add(["-A"]);
  const msg =
    message.trim() || "chore: apply fixes from AI Code Engine";
  try {
    await git.commit(msg);
  } catch (err: unknown) {
    const m = err instanceof Error ? err.message : String(err);
    if (m.includes("nothing to commit")) {
      throw new HttpError(
        400,
        "Nothing to commit after staging (no diff from HEAD).",
        "NOTHING_TO_COMMIT",
      );
    }
    throw err;
  }

  await git.remote(["set-url", "origin", authUrl]);
  try {
    await git.raw(["push", "-u", "origin", branch]);
  } catch (err: unknown) {
    const m = err instanceof Error ? err.message : String(err);
    log.warn({ err: m }, "Git push failed");
    if (
      /non-fast-forward|rejected|failed to push|could not read|403|401|denied/i.test(
        m,
      )
    ) {
      throw new HttpError(
        409,
        `Push was rejected or blocked. You may need to pull and resolve conflicts on GitHub, or check branch permissions. Details: ${m}`,
        "PUSH_REJECTED",
      );
    }
    throw new HttpError(
      502,
      `Push failed: ${m}`,
      "BAD_GATEWAY",
    );
  } finally {
    await git.remote(["set-url", "origin", httpsUrl]);
  }

  const logResult = await git.log({ maxCount: 1 });
  const last = logResult.latest;
  return { branch, commitSha: last?.hash ?? "" };
}
