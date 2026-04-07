import type { Logger } from "pino";
import mongoose from "mongoose";
import type { Env } from "../config/env.js";
import { HttpError } from "../middleware/errorHandler.js";
import { FileAst } from "../models/fileAst.model.js";
import { ProjectAnalysis } from "../models/projectAnalysis.model.js";
import type { SerializedAstNode } from "../utils/astSerializer.js";
import { buildDependencyGraph, mergeGraphNodes } from "./analysis/graphBuilder.js";
import { extractImportsFromAst } from "./analysis/importExtractor.js";
import { detectSmellsForFile } from "./analysis/smells.js";
import { extractSymbolsFromAst } from "./analysis/symbolExtractor.js";
import type {
  AnalysisSummary,
  DependencyEdge,
  FileAnalysisResult,
  ProjectAnalysisPayload,
} from "./analysis/types.js";

function computeSummary(files: FileAnalysisResult[]): AnalysisSummary {
  let functionCount = 0;
  let classCount = 0;
  let importCount = 0;
  let smellCount = 0;
  let complexitySum = 0;
  let maxCyclomatic = 0;

  for (const f of files) {
    functionCount += f.functions.length;
    classCount += f.classes.length;
    importCount += f.imports.length;
    smellCount += f.smells.length;
    for (const fn of f.functions) {
      complexitySum += fn.cyclomaticComplexity;
      maxCyclomatic = Math.max(maxCyclomatic, fn.cyclomaticComplexity);
    }
  }

  const avgCyclomatic = functionCount > 0 ? complexitySum / functionCount : 0;

  return {
    fileCount: files.length,
    functionCount,
    classCount,
    importCount,
    avgCyclomaticComplexity: Math.round(avgCyclomatic * 100) / 100,
    maxCyclomaticComplexity: maxCyclomatic,
    smellCount,
  };
}

/**
 * STEP 4: static analysis over persisted Tree-sitter ASTs.
 */
export class AnalysisService {
  constructor(private readonly env: Env) {}

  /**
   * Runs analysis for all {@link FileAst} rows of a project and upserts {@link ProjectAnalysis}.
   * @returns `null` when there is nothing to analyze (no AST rows).
   */
  async analyzeAndPersist(
    projectId: mongoose.Types.ObjectId,
    projectFilePaths: string[],
    log: Logger,
  ): Promise<ProjectAnalysisPayload | null> {
    log.info(
      { projectId: String(projectId), paths: projectFilePaths.length },
      "Static analysis run started",
    );

    const normalizedPaths = projectFilePaths.map((p) => p.replace(/\\/g, "/"));
    const projectPaths = new Set(normalizedPaths);

    const rows = await FileAst.find({ projectId }).lean();
    if (rows.length === 0) {
      log.warn({ projectId: String(projectId) }, "Skipping analysis: no FileAst rows");
      return null;
    }

    const files: FileAnalysisResult[] = [];
    const allEdges: DependencyEdge[] = [];

    for (const row of rows) {
      const ast = row.ast as SerializedAstNode;
      const { functions, classes } = extractSymbolsFromAst(ast, row.language);
      const imports = extractImportsFromAst(ast, row.language);

      const fileResult: FileAnalysisResult = {
        path: row.path,
        language: row.language,
        functions,
        classes,
        imports,
        smells: [],
      };
      fileResult.smells = detectSmellsForFile(fileResult, ast, this.env);
      files.push(fileResult);
      allEdges.push(
        ...buildDependencyGraph(row.path, imports, projectPaths),
      );
    }

    const summary = computeSummary(files);
    const nodes = mergeGraphNodes(normalizedPaths, allEdges);

    const payload: ProjectAnalysisPayload = {
      summary,
      files,
      dependencyGraph: { nodes, edges: allEdges },
    };

    await ProjectAnalysis.findOneAndReplace(
      { projectId },
      {
        projectId,
        analyzedAt: new Date(),
        data: payload,
      },
      { upsert: true },
    );

    log.info(
      {
        projectId: String(projectId),
        functions: summary.functionCount,
        smells: summary.smellCount,
      },
      "Project analysis persisted",
    );

    return payload;
  }

  /**
   * Loads the latest persisted analysis document, or throws if missing.
   */
  async getAnalysisOrThrow(projectId: string): Promise<IProjectAnalysisLean> {
    if (!mongoose.isValidObjectId(projectId)) {
      throw new HttpError(400, "Invalid project id", "BAD_REQUEST");
    }
    const doc = await ProjectAnalysis.findOne({
      projectId: new mongoose.Types.ObjectId(projectId),
    }).lean();
    if (!doc || Array.isArray(doc)) {
      throw new HttpError(
        404,
        "No analysis found for this project",
        "ANALYSIS_NOT_FOUND",
      );
    }
    return doc as unknown as IProjectAnalysisLean;
  }
}

export interface IProjectAnalysisLean {
  _id: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  analyzedAt: Date;
  data: ProjectAnalysisPayload;
}
