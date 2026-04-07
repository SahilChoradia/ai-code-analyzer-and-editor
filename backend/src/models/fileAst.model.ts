import mongoose, { Schema } from "mongoose";
import type { SerializedAstNode } from "../utils/astSerializer.js";

export interface IFileAst {
  projectId: mongoose.Types.ObjectId;
  path: string;
  language: string;
  size: number;
  nodeCount: number;
  ast: SerializedAstNode;
}

const fileAstSchema = new Schema<IFileAst>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    path: { type: String, required: true },
    language: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
    nodeCount: { type: Number, required: true, min: 0 },
    ast: { type: Schema.Types.Mixed, required: true },
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

fileAstSchema.index({ projectId: 1, path: 1 }, { unique: true });

export const FileAst =
  mongoose.models.FileAst ?? mongoose.model<IFileAst>("FileAst", fileAstSchema);
