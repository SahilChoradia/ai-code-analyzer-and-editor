import mongoose from "mongoose";
import { getEnv } from "../config/env.js";
import type { IAiFileInsight } from "../models/project.model.js";
import { FileAst } from "../models/fileAst.model.js";
import { Project } from "../models/project.model.js";
import { ProjectAnalysis } from "../models/projectAnalysis.model.js";
import type { ProjectAnalysisPayload } from "./analysis/types.js";
import type { SerializedAstNode } from "../utils/astSerializer.js";
import {
  buildVisualizationPayload,
  type VizGraphData,
} from "./visualization/buildGraphData.js";

export interface ProjectBundle {
  project: Record<string, unknown>;
  astFileCount: number;
  analysis: Record<string, unknown> | null;
  graphData: ReturnType<typeof buildVisualizationPayload>["graphData"];
  complexityMetrics: ReturnType<typeof buildVisualizationPayload>["complexityMetrics"];
  aiInsights: IAiFileInsight[];
}

/**
 * Loads project row, AST file count, optional analysis, and STEP 8 visualization payloads.
 */
export async function loadProjectBundle(
  projectId: string,
): Promise<ProjectBundle | null> {
  if (!mongoose.isValidObjectId(projectId)) {
    return null;
  }
  const oid = new mongoose.Types.ObjectId(projectId);
  const project = await Project.findById(oid).lean();
  if (!project) {
    return null;
  }
  const astFileCount = await FileAst.countDocuments({ projectId: oid });
  const analysisDoc = await ProjectAnalysis.findOne({ projectId: oid }).lean();

  const env = getEnv();
  let graphData: VizGraphData = { nodes: [], edges: [] };
  let complexityMetrics: ReturnType<
    typeof buildVisualizationPayload
  >["complexityMetrics"] = [];

  if (analysisDoc && !Array.isArray(analysisDoc)) {
    const payload = analysisDoc.data as ProjectAnalysisPayload;
    const astRows = await FileAst.find({ projectId: oid })
      .select({ path: 1, language: 1, ast: 1 })
      .lean();
    const aiInsights = (project as { aiInsights?: IAiFileInsight[] })
      .aiInsights;
    const built = buildVisualizationPayload(
      payload,
      aiInsights,
      astRows.map((r) => ({
        path: r.path,
        language: r.language,
        ast: r.ast as SerializedAstNode,
      })),
      env.ANALYSIS_COMPLEXITY_WARN_THRESHOLD,
      env.ANALYSIS_COMPLEXITY_ERROR_THRESHOLD,
    );
    graphData = built.graphData;
    complexityMetrics = built.complexityMetrics;
  }

  const aiInsightsList = (project as { aiInsights?: IAiFileInsight[] })
    .aiInsights ?? [];

  return {
    project: project as unknown as Record<string, unknown>,
    astFileCount,
    analysis: analysisDoc
      ? (analysisDoc as unknown as Record<string, unknown>)
      : null,
    graphData,
    complexityMetrics,
    aiInsights: aiInsightsList,
  };
}
