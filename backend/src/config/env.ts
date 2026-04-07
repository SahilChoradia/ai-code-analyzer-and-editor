import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

/**
 * Validated application configuration loaded from environment variables.
 * Fails fast at startup if required values are missing or invalid.
 */
const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    MONGODB_URI: z
      .string()
      .min(1, "MONGODB_URI is required")
      .url("MONGODB_URI must be a valid URL"),
    LOG_LEVEL: z
      .enum(["trace", "debug", "info", "warn", "error", "fatal"])
      .default("info"),
    /** Maximum ZIP upload size in megabytes (default 20). */
    MAX_UPLOAD_MB: z.coerce.number().positive().max(512).default(20),
    /** Git shallow clone timeout in milliseconds. */
    GITHUB_CLONE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .max(600_000)
      .default(120_000),
    /** Optional override for temp directories (defaults to OS tmpdir). */
    INGEST_TEMP_ROOT: z.string().min(1).optional(),
    /** Base directory for persistent edit workspaces (GitHub OAuth projects). Defaults to `<tmpdir>/ace-edit-workspaces`. */
    PROJECT_EDIT_WORKSPACE_ROOT: z.string().min(1).optional(),
    /** Skip AST for files larger than this (bytes). */
    AST_MAX_FILE_BYTES: z.coerce.number().int().positive().default(2_097_152),
    /** Maximum depth when serializing Tree-sitter nodes. */
    AST_MAX_DEPTH: z.coerce.number().int().positive().max(256).default(64),
    /** Maximum serialized nodes per file (prevents huge MongoDB docs). */
    AST_MAX_NODES_PER_FILE: z.coerce
      .number()
      .int()
      .positive()
      .max(500_000)
      .default(25_000),
    /** Max characters stored on leaf `t` fields. */
    AST_MAX_TEXT_LEN: z.coerce.number().int().positive().max(4096).default(256),
    /** Cyclomatic complexity warning threshold per function (STEP 4). */
    ANALYSIS_COMPLEXITY_WARN_THRESHOLD: z.coerce
      .number()
      .int()
      .min(1)
      .default(10),
    /** Cyclomatic complexity error threshold per function (STEP 4). */
    ANALYSIS_COMPLEXITY_ERROR_THRESHOLD: z.coerce
      .number()
      .int()
      .min(1)
      .default(15),
    /** Max nesting depth before DEEP_NESTING smell (STEP 4). */
    ANALYSIS_MAX_NESTING_DEPTH: z.coerce.number().int().min(1).default(5),
    /** Function subtree node count before LARGE_FUNCTION smell (STEP 4). */
    ANALYSIS_LARGE_FUNCTION_NODES: z.coerce
      .number()
      .int()
      .min(1)
      .default(400),
    /** Rate limit window for mutating/read APIs (ms). */
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    /** Max requests per IP per window (excluding /health, /ready). */
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),

    /** Google Gemini API key (optional — AI insights skipped when unset). */
    GEMINI_API_KEY: z.string().optional(),
    /** Gemini API host (Google Generative Language API). */
    GEMINI_API_BASE: z
      .string()
      .url()
      .default("https://generativelanguage.googleapis.com"),
    /** Model id, e.g. gemini-2.0-flash, gemini-1.5-flash */
    GEMINI_MODEL: z.string().min(1).default("gemini-2.0-flash"),
    /** Per HTTP request to the LLM (ms). */
    AI_REQUEST_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .max(300_000)
      .default(90_000),
    /** Retries for transient LLM/network failures (not counted as first attempt). */
    AI_MAX_RETRIES: z.coerce.number().int().min(0).max(8).default(2),
    /** Max source files to send to the LLM per analyze run (prioritized). */
    AI_MAX_FILES: z.coerce.number().int().min(1).max(40).default(8),
    /** Max AST nodes serialized into outline text per file. */
    AI_MAX_OUTLINE_NODES: z.coerce.number().int().min(50).max(5000).default(450),
    /** Max characters of outline text per file. */
    AI_MAX_OUTLINE_CHARS: z.coerce
      .number()
      .int()
      .min(500)
      .max(50_000)
      .default(3200),
    /** Files per LLM request (smaller = safer token limits). */
    AI_BATCH_SIZE: z.coerce.number().int().min(1).max(6).default(2),
    /** Parallel LLM batch requests. */
    AI_MAX_CONCURRENT_BATCHES: z.coerce.number().int().min(1).max(4).default(2),
    /** Target max characters per Gemini batch (adaptive packing). */
    AI_BATCH_CHAR_BUDGET: z.coerce
      .number()
      .int()
      .min(2000)
      .max(200_000)
      .default(12_000),
    /** Split outlines larger than this into multiple Gemini requests (overlap ~100 chars). */
    AI_OUTLINE_CHUNK_CHARS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(32_000)
      .default(4000),

    /** Redis URL for BullMQ + optional response cache (optional — sync analyze if unset). */
    REDIS_URL: z.string().url().optional(),
    /** After ingest, enqueue analysis instead of running inline (requires REDIS_URL). */
    QUEUE_AFTER_INGEST: z.coerce.boolean().default(false),
    /** TTL for cached Gemini batch JSON (seconds). 0 disables cache storage. */
    GEMINI_CACHE_TTL_SEC: z.coerce.number().int().min(0).max(2_592_000).default(604_800),
    /** BullMQ worker concurrency. */
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
    /** Run analysis worker inside the API process (requires REDIS_URL). */
    WORKER_EMBEDDED: z.coerce.boolean().default(true),

    /** GitHub OAuth (optional — enables /auth/*, GET /repos, POST /ingest/github). */
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    /** e.g. http://localhost:4000/auth/github/callback */
    CALLBACK_URL: z.string().url().optional(),
    /** Min 32 chars when OAuth is configured. */
    SESSION_SECRET: z.string().optional(),
    /** Frontend origin for post-login redirect, e.g. http://localhost:3000 */
    FRONTEND_URL: z.string().url().optional(),
  })
  .superRefine((val, ctx) => {
    const id = val.GITHUB_CLIENT_ID?.trim();
    if (!id) {
      return;
    }
    if (!val.GITHUB_CLIENT_SECRET?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "GITHUB_CLIENT_SECRET is required when GITHUB_CLIENT_ID is set",
        path: ["GITHUB_CLIENT_SECRET"],
      });
    }
    if (!val.CALLBACK_URL?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "CALLBACK_URL is required when GITHUB_CLIENT_ID is set",
        path: ["CALLBACK_URL"],
      });
    }
    if (!val.FRONTEND_URL?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "FRONTEND_URL is required when GITHUB_CLIENT_ID is set",
        path: ["FRONTEND_URL"],
      });
    }
    const sec = val.SESSION_SECRET?.trim();
    if (!sec || sec.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "SESSION_SECRET is required (min 32 characters) when GitHub OAuth is enabled",
        path: ["SESSION_SECRET"],
      });
    }
  })
  .transform((data) => {
    const ghId = data.GITHUB_CLIENT_ID?.trim();
    const ghSecret = data.GITHUB_CLIENT_SECRET?.trim();
    const callback = data.CALLBACK_URL?.trim();
    const sessionSecret = data.SESSION_SECRET?.trim();
    const frontend = data.FRONTEND_URL?.trim();
    const githubOAuthEnabled = Boolean(
      ghId &&
        ghSecret &&
        callback &&
        sessionSecret &&
        sessionSecret.length >= 32 &&
        frontend,
    );
    return {
      ...data,
      MAX_UPLOAD_BYTES: Math.trunc(data.MAX_UPLOAD_MB * 1024 * 1024),
      GEMINI_API_KEY:
        data.GEMINI_API_KEY && data.GEMINI_API_KEY.trim().length > 0
          ? data.GEMINI_API_KEY.trim()
          : undefined,
      REDIS_URL:
        data.REDIS_URL && data.REDIS_URL.trim().length > 0
          ? data.REDIS_URL.trim()
          : undefined,
      GITHUB_CLIENT_ID: ghId,
      GITHUB_CLIENT_SECRET: ghSecret,
      CALLBACK_URL: callback,
      SESSION_SECRET: sessionSecret,
      FRONTEND_URL: frontend,
      githubOAuthEnabled,
    };
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * Returns singleton validated env. Throws if validation fails.
 */
export function getEnv(): Env {
  if (cached) {
    return cached;
  }
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors;
    throw new Error(
      `Invalid environment configuration: ${JSON.stringify(details)}`,
    );
  }
  cached = parsed.data;
  return cached;
}
