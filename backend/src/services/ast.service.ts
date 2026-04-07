import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Logger } from "pino";
import mongoose from "mongoose";
import Parser from "web-tree-sitter";
import type { Env } from "../config/env.js";
import type { IAstSummary } from "../models/project.model.js";
import { FileAst } from "../models/fileAst.model.js";
import {
  ensureTreeSitterInitialized,
  loadLanguageForSource,
} from "../parsers/treeSitterInit.js";
import type { ScannedFile } from "../utils/fileScanner.js";
import {
  type SerializedAstNode,
  countSerializedNodes,
  serializeSyntaxTree,
} from "../utils/astSerializer.js";

/**
 * Parses source files with Tree-sitter (WASM) and persists bounded AST JSON to MongoDB.
 */
export class AstService {
  private parser: Parser | null = null;

  constructor(private readonly env: Env) {}

  /**
   * Walks all scanned files under rootDir, parses each with the matching grammar,
   * and bulk-inserts {@link FileAst} documents. Collects per-file failures without aborting.
   */
  async parseAndPersist(
    projectId: mongoose.Types.ObjectId,
    rootDir: string,
    files: ScannedFile[],
    log: Logger,
  ): Promise<IAstSummary> {
    await ensureTreeSitterInitialized();
    if (!this.parser) {
      this.parser = new Parser();
    }
    const parser = this.parser;

    const failed: { path: string; reason: string }[] = [];
    let totalTreeNodes = 0;
    const docs: Array<{
      projectId: mongoose.Types.ObjectId;
      path: string;
      language: string;
      size: number;
      nodeCount: number;
      ast: SerializedAstNode;
    }> = [];

    for (const f of files) {
      const abs = path.join(rootDir, ...f.path.split("/"));
      let buf: Buffer;
      try {
        buf = await readFile(abs);
      } catch (err: unknown) {
        failed.push({
          path: f.path,
          reason: "Could not read file from workspace",
        });
        log.warn({ err, path: f.path }, "AST read failed");
        continue;
      }

      if (buf.length > this.env.AST_MAX_FILE_BYTES) {
        failed.push({
          path: f.path,
          reason: `File exceeds AST_MAX_FILE_BYTES (${this.env.AST_MAX_FILE_BYTES})`,
        });
        continue;
      }

      const source = buf.toString("utf8");

      try {
        const lang = await loadLanguageForSource(f.language, f.path);
        parser.setLanguage(lang);
        const tree = parser.parse(source);
        const ast = serializeSyntaxTree(tree.rootNode, {
          maxDepth: this.env.AST_MAX_DEPTH,
          maxNodes: this.env.AST_MAX_NODES_PER_FILE,
          maxTextLen: this.env.AST_MAX_TEXT_LEN,
        });
        const nodeCount = countSerializedNodes(ast);
        totalTreeNodes += nodeCount;
        docs.push({
          projectId,
          path: f.path,
          language: f.language,
          size: f.size,
          nodeCount,
          ast,
        });
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : String(err);
        failed.push({ path: f.path, reason });
        log.warn({ err, path: f.path }, "AST parse failed");
      }
    }

    if (docs.length > 0) {
      await FileAst.insertMany(docs, { ordered: false });
    }

    const parsedFiles = docs.length;
    let status: IAstSummary["status"];
    if (parsedFiles === 0) {
      status = "failed";
    } else if (failed.length > 0) {
      status = "partial";
    } else {
      status = "complete";
    }

    return {
      status,
      parsedFiles,
      failedFiles: failed,
      totalTreeNodes,
      completedAt: new Date(),
    };
  }
}
