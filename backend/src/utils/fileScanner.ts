import { createReadStream } from "node:fs";
import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";

/** Extensions ingested for downstream AST / analysis (lowercase, with dot). */
const SUPPORTED_EXTENSIONS = new Set([
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".py",
  ".java",
  ".cpp",
  ".c",
]);

/** Directory names skipped anywhere in the relative path (case-insensitive). */
const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "__pycache__",
  ".venv",
  "venv",
]);

export interface ScannedFile {
  /** POSIX-style path relative to scan root (e.g. src/app.ts). */
  path: string;
  name: string;
  language: string;
  size: number;
}

function languageFromExtension(ext: string): string {
  const map: Record<string, string> = {
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".py": "python",
    ".java": "java",
    ".cpp": "cpp",
    ".c": "c",
  };
  return map[ext] ?? "unknown";
}

function shouldSkipDirName(name: string): boolean {
  return SKIP_DIR_NAMES.has(name.toLowerCase());
}

function isHiddenPathSegment(segment: string): boolean {
  return segment.startsWith(".");
}

/**
 * Ensures a resolved path stays under root (after realpath) to avoid symlink escapes.
 */
async function isPathInsideRoot(
  candidatePath: string,
  rootReal: string,
): Promise<boolean> {
  const resolved = await realpath(candidatePath);
  const normRoot = rootReal.endsWith(path.sep) ? rootReal : rootReal + path.sep;
  return resolved === rootReal || resolved.startsWith(normRoot);
}

/**
 * Recursively scans a directory tree for supported source files.
 * Skips hidden segments, dependency/build folders, symlinks, and unsupported extensions.
 */
export async function scanDirectory(rootDir: string): Promise<ScannedFile[]> {
  const rootReal = await realpath(rootDir);
  const results: ScannedFile[] = [];

  async function walk(currentDir: string, relativePrefix: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const ent of entries) {
      const name = ent.name;
      if (isHiddenPathSegment(name)) {
        continue;
      }

      const absPath = path.join(currentDir, name);
      const relPath = relativePrefix ? `${relativePrefix}/${name}` : name;

      if (ent.isDirectory()) {
        if (shouldSkipDirName(name)) {
          continue;
        }
        if (!(await isPathInsideRoot(absPath, rootReal))) {
          continue;
        }
        await walk(absPath, relPath);
        continue;
      }

      if (ent.isSymbolicLink() || !ent.isFile()) {
        continue;
      }

      const st = await lstat(absPath);
      if (!st.isFile() || st.isSymbolicLink()) {
        continue;
      }
      if (!(await isPathInsideRoot(absPath, rootReal))) {
        continue;
      }

      const ext = path.extname(name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) {
        continue;
      }

      results.push({
        path: relPath.split(path.sep).join("/"),
        name,
        language: languageFromExtension(ext),
        size: st.size,
      });
    }
  }

  await walk(rootReal, "");
  results.sort((a, b) => a.path.localeCompare(b.path));
  return results;
}

/**
 * Streams a file for future steps (AST); validates path is inside root.
 */
export function createSafeReadStream(
  rootDir: string,
  relativePosixPath: string,
): ReturnType<typeof createReadStream> {
  const normalized = relativePosixPath.replace(/\\/g, "/");
  if (
    normalized.startsWith("/") ||
    normalized.split("/").some((p) => p === "" || p === "..")
  ) {
    throw new Error("Invalid relative path");
  }
  const abs = path.join(rootDir, ...normalized.split("/"));
  return createReadStream(abs);
}
