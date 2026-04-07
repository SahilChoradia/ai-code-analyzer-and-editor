import mongoose, { Schema, type HydratedDocument } from "mongoose";

/**
 * GitHub-authenticated user. `accessToken` is never exposed in API responses.
 */
export interface IUser {
  githubId: string;
  username: string;
  displayName?: string;
  avatar?: string;
  accessToken: string;
  refreshToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type IUserDocument = HydratedDocument<IUser>;

const userSchema = new Schema<IUser>(
  {
    githubId: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true, trim: true },
    displayName: { type: String, trim: true },
    avatar: { type: String, trim: true },
    accessToken: { type: String, required: true },
    refreshToken: { type: String, trim: true },
  },
  { timestamps: true, versionKey: false },
);

userSchema.set("toJSON", {
  transform(_doc, ret) {
    const o = ret as unknown as Record<string, unknown>;
    delete o.accessToken;
    delete o.refreshToken;
    return ret;
  },
});

export const User =
  mongoose.models.User ?? mongoose.model<IUser>("User", userSchema);
