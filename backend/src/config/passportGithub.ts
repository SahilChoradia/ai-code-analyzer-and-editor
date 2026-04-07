import passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github2";
import type { Profile } from "passport-github2";
import type { Env } from "./env.js";
import { User } from "../models/user.model.js";

/**
 * GitHub OAuth strategy; persists user and encrypted-at-rest token in MongoDB.
 */
export function configureGithubPassport(env: Env): void {
  passport.use(
    new GitHubStrategy(
      {
        clientID: env.GITHUB_CLIENT_ID!,
        clientSecret: env.GITHUB_CLIENT_SECRET!,
        callbackURL: env.CALLBACK_URL!,
        scope: ["read:user", "repo"],
      },
      async (
        accessToken: string,
        refreshToken: string | undefined,
        profile: Profile,
        done: (err: Error | null, user?: false | Express.User | undefined) => void,
      ) => {
        try {
          const githubId = String(profile.id);
          const username = profile.username ?? profile.displayName ?? githubId;

          const user = await User.findOneAndUpdate(
            { githubId },
            {
              $set: {
                username,
                displayName: profile.displayName ?? undefined,
                avatar: profile.photos?.[0]?.value,
                accessToken,
                refreshToken: refreshToken?.trim() || undefined,
              },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
          ).exec();

          done(null, user);
        } catch (err: unknown) {
          done(err as Error);
        }
      },
    ),
  );

  passport.serializeUser((user, done) => {
    const u = user as Express.User;
    done(null, String(u._id));
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await User.findById(id).exec();
      done(null, user ?? undefined);
    } catch (err: unknown) {
      done(err as Error);
    }
  });
}
