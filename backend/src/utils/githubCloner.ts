import type { Logger } from "pino";
import simpleGit from "simple-git";
import { HttpError } from "../middleware/errorHandler.js";

/**
 * Normalizes user-provided GitHub URLs to an HTTPS clone URL (github.com only).
 */
export function normalizeGithubCloneUrl(repoUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(repoUrl.trim());
  } catch {
    throw new HttpError(400, "Invalid repository URL", "BAD_REQUEST");
  }

  const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
  if (host !== "github.com") {
    throw new HttpError(
      400,
      "Only public github.com repositories are supported",
      "BAD_REQUEST",
    );
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    throw new HttpError(400, "Invalid GitHub repository path", "BAD_REQUEST");
  }

  const owner = segments[0];
  let repo = segments[1];
  if (repo.endsWith(".git")) {
    repo = repo.slice(0, -4);
  }

  if (!/^[a-zA-Z0-9_.-]+$/.test(owner) || !/^[a-zA-Z0-9_.-]+$/.test(repo)) {
    throw new HttpError(
      400,
      "Invalid GitHub owner or repository name",
      "BAD_REQUEST",
    );
  }

  return `https://github.com/${owner}/${repo}.git`;
}

/**
 * HTTPS clone URL with OAuth token (never log this value).
 * @see https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
 */
export function buildAuthenticatedGithubCloneUrl(
  httpsCloneUrl: string,
  accessToken: string,
): string {
  const trimmed = httpsCloneUrl.trim();
  const u = new URL(trimmed);
  if (u.hostname.replace(/^www\./i, "").toLowerCase() !== "github.com") {
    throw new HttpError(400, "Only github.com repositories are supported", "BAD_REQUEST");
  }
  const host = u.host;
  const path = `${u.pathname}${u.search}`;
  const enc = encodeURIComponent(accessToken);
  return `https://x-access-token:${enc}@${host}${path}`;
}

function isAuthRelatedMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("authentication failed") ||
    m.includes("could not read username") ||
    m.includes("repository not found") ||
    m.includes("terminal prompts disabled")
  );
}

/**
 * Shallow-clones a public GitHub repository into an empty destination directory.
 * Uses async/await only — simple-git's `clone()` returns a chainable thenable, not a
 * native Promise, so `.finally()` must not be chained on it.
 */
export async function cloneGithubRepo(
  cloneUrl: string,
  destinationDir: string,
  log: Logger,
  cloneTimeoutMs: number,
): Promise<void> {
  await cloneGithubRepoInner(cloneUrl, destinationDir, log, cloneTimeoutMs);
}

async function cloneGithubRepoInner(
  cloneUrl: string,
  destinationDir: string,
  log: Logger,
  cloneTimeoutMs: number,
): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new HttpError(504, "Git clone timed out", "GATEWAY_TIMEOUT"));
      }, cloneTimeoutMs);
      timeoutId.unref?.();
    });

    const cloneTask = simpleGit().clone(cloneUrl, destinationDir, [
      "--depth",
      "1",
      "--single-branch",
    ]);

    await Promise.race([cloneTask, timeoutPromise]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn({ err, cloneUrl: cloneUrl.replace(/x-access-token:[^@]+@/i, "x-access-token:***@") }, "Git clone failed");

    if (err instanceof HttpError) {
      throw err;
    }

    if (isAuthRelatedMessage(message)) {
      throw new HttpError(
        403,
        "Unable to clone repository (private, missing access, or not found)",
        "FORBIDDEN",
      );
    }

    throw new HttpError(
      502,
      `Git clone failed: ${message || "unknown error"}`,
      "BAD_GATEWAY",
    );
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
