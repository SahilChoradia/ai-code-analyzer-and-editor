import mongoose, { Schema } from "mongoose";

/**
 * Single source file metadata attached to a project after ingestion.
 */
export interface IProjectFile {
  path: string;
  name: string;
  language: string;
  size: number;
}

/**
 * Summary of Tree-sitter AST persistence for a project.
 */
export interface IAstSummary {
  status: "complete" | "partial" | "failed";
  parsedFiles: number;
  failedFiles: { path: string; reason: string }[];
  totalTreeNodes: number;
  completedAt?: Date;
}

/** STEP 7: LLM-generated file-level explanations and suggestions. */
export interface IAiFileInsight {
  filePath: string;
  explanation: string;
  issues: string[];
  suggestions: string[];
}

export type ProjectLifecycleStatus =
  | "uploaded"
  | "processing"
  | "queued"
  | "ai_processing"
  | "analyzed"
  | "completed"
  | "failed";

export interface IProject {
  name: string;
  sourceType: "zip" | "github";
  repoUrl?: string;
  /** Set when the project was created from GitHub OAuth ingest. */
  userId?: mongoose.Types.ObjectId;
  files: IProjectFile[];
  status: ProjectLifecycleStatus;
  createdAt: Date;
  ast?: IAstSummary;
  aiInsights?: IAiFileInsight[];
  aiInsightsAt?: Date;
  /** User-visible note when AI was skipped, partial, or failed. */
  aiInsightsNotice?: string;
  /** Last BullMQ analysis job id (when using queue). */
  analysisJobId?: string;
  /** Last analysis failure message. */
  analysisError?: string;
  /**
   * Server-side clone used for Fix & Edit (OAuth GitHub imports only).
   * Never exposed to API clients.
   */
  editWorkspacePath?: string;
}

const projectFileSchema = new Schema<IProjectFile>(
  {
    path: { type: String, required: true },
    name: { type: String, required: true },
    language: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const astFailureSchema = new Schema(
  {
    path: { type: String, required: true },
    reason: { type: String, required: true },
  },
  { _id: false },
);

const astSummarySchema = new Schema<IAstSummary>(
  {
    status: {
      type: String,
      required: true,
      enum: ["complete", "partial", "failed"],
    },
    parsedFiles: { type: Number, required: true, min: 0 },
    failedFiles: { type: [astFailureSchema], default: [] },
    totalTreeNodes: { type: Number, required: true, min: 0 },
    completedAt: { type: Date },
  },
  { _id: false },
);

const aiInsightSchema = new Schema<IAiFileInsight>(
  {
    filePath: { type: String, required: true },
    explanation: { type: String, required: true },
    issues: { type: [String], default: [] },
    suggestions: { type: [String], default: [] },
  },
  { _id: false },
);

const projectSchema = new Schema<IProject>(
  {
    name: { type: String, required: true, trim: true },
    sourceType: {
      type: String,
      required: true,
      enum: ["zip", "github"],
    },
    repoUrl: { type: String, trim: true },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    files: { type: [projectFileSchema], default: [] },
    status: {
      type: String,
      required: true,
      enum: [
        "uploaded",
        "processing",
        "queued",
        "ai_processing",
        "analyzed",
        "completed",
        "failed",
      ],
      default: "processing",
    },
    ast: { type: astSummarySchema, required: false },
    aiInsights: { type: [aiInsightSchema], default: [] },
    aiInsightsAt: { type: Date },
    aiInsightsNotice: { type: String, trim: true },
    analysisJobId: { type: String, trim: true },
    analysisError: { type: String, trim: true, maxlength: 2000 },
    editWorkspacePath: { type: String, trim: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  {
    versionKey: false,
  },
);

projectSchema.index({ createdAt: -1 });

export const Project =
  mongoose.models.Project ??
  mongoose.model<IProject>("Project", projectSchema);
