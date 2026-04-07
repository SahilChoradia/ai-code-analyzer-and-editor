import AdmZip from "adm-zip";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { HttpError } from "../middleware/errorHandler.js";

/**
 * Resolves a zip entry path inside extractRoot and blocks zip-slip / absolute paths.
 * @returns Absolute file path to write, or null for directory entries.
 */
export function resolveSafeZipTarget(
  extractRoot: string,
  entryName: string,
): string | null {
  const normalized = entryName.replace(/\\/g, "/");
  const segments = normalized.split("/").filter((s) => s.length > 0);

  if (segments.some((s) => s === "..")) {
    return null;
  }

  const joined = path.join(extractRoot, ...segments);
  const resolvedFile = path.resolve(joined);
  const resolvedRoot = path.resolve(extractRoot);
  const prefix =
    resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;

  if (resolvedFile !== resolvedRoot && !resolvedFile.startsWith(prefix)) {
    return null;
  }

  const last = segments[segments.length - 1];
  if (!last || last.endsWith("/")) {
    return null;
  }

  return resolvedFile;
}

/**
 * Extracts a ZIP buffer into a directory with zip-slip protection.
 */
export async function extractZipSafely(
  zipBuffer: Buffer,
  extractRoot: string,
): Promise<void> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    throw new HttpError(400, "Invalid or corrupted ZIP archive");
  }

  const entries = zip.getEntries();
  if (entries.length === 0) {
    throw new HttpError(400, "ZIP archive is empty");
  }

  let wroteFile = false;

  for (const entry of entries) {
    if (entry.isDirectory) {
      continue;
    }

    const name = entry.entryName;
    const target = resolveSafeZipTarget(extractRoot, name);
    if (!target) {
      throw new HttpError(400, "ZIP contains unsafe paths (zip-slip attempt)");
    }

    const dir = path.dirname(target);
    await mkdir(dir, { recursive: true });
    await writeFile(target, entry.getData());
    wroteFile = true;
  }

  if (!wroteFile) {
    throw new HttpError(400, "ZIP archive contains no files");
  }
}
