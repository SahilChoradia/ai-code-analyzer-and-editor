import mongoose, { Schema } from "mongoose";
import type { ProjectAnalysisPayload } from "../services/analysis/types.js";

export interface IProjectAnalysis {
  projectId: mongoose.Types.ObjectId;
  analyzedAt: Date;
  data: ProjectAnalysisPayload;
}

const projectAnalysisSchema = new Schema<IProjectAnalysis>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      unique: true,
      index: true,
    },
    analyzedAt: { type: Date, required: true, default: () => new Date() },
    data: { type: Schema.Types.Mixed, required: true },
  },
  {
    versionKey: false,
  },
);

export const ProjectAnalysis =
  mongoose.models.ProjectAnalysis ??
  mongoose.model<IProjectAnalysis>(
    "ProjectAnalysis",
    projectAnalysisSchema,
  );
