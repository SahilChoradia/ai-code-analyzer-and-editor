import type { Types } from "mongoose";

declare global {
  namespace Express {
    /** Populated by Passport after GitHub OAuth (Mongoose document). */
    interface User {
      _id: Types.ObjectId;
      githubId: string;
      username: string;
      displayName?: string;
      avatar?: string;
      accessToken: string;
      refreshToken?: string;
    }
  }
}

export {};
