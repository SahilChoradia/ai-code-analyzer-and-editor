import session from "express-session";
import MongoStore from "connect-mongo";
import type { Env } from "./env.js";

/**
 * Server-side session stored in MongoDB (cookie is httpOnly; token never sent to browser).
 */
export function createSessionMiddleware(env: Env): ReturnType<typeof session> {
  return session({
    name: "ace.sid",
    secret: env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: env.MONGODB_URI,
      ttl: 14 * 24 * 60 * 60,
    }),
    cookie: {
      maxAge: 14 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      // Force secure and sameSite: none for cross-domain cookie stability (Render/Vercel)
      // Note: This requires HTTPS to be sent back by the browser.
      secure: true,
      sameSite: "none",
    },
  });
}
