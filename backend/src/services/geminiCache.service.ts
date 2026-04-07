import { createHash } from "node:crypto";
import type IORedis from "ioredis";

/** Matches {@link import("./ai.service.js").AiFileInsight} — kept local to avoid circular imports. */
export type CachedGeminiInsight = {
  filePath: string;
  explanation: string;
  issues: string[];
  suggestions: string[];
};

/**
 * Redis cache for Gemini batch responses (STEP 9).
 * Key = SHA-256 of model + stable batch fingerprint (paths + content hashes).
 */
export class GeminiResponseCache {
  constructor(
    private readonly redis: IORedis,
    private readonly ttlSec: number,
    private readonly prefix = "ace:gemini:v1:",
  ) {}

  batchKey(fingerprint: string): string {
    return `${this.prefix}${fingerprint}`;
  }

  /**
   * Fingerprint from batch jobs: model + sorted path + sha256(outline)+sha256(metrics).
   */
  static fingerprint(
    model: string,
    batch: Array<{
      path: string;
      outline: string;
      metrics: Record<string, unknown>;
    }>,
  ): string {
    const parts = [...batch]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((j) => {
        const oh = createHash("sha256").update(j.outline).digest("hex").slice(0, 16);
        const mh = createHash("sha256")
          .update(JSON.stringify(j.metrics))
          .digest("hex")
          .slice(0, 16);
        return `${j.path}|${oh}|${mh}`;
      });
    const raw = `${model}::${parts.join("||")}`;
    return createHash("sha256").update(raw).digest("hex");
  }

  async get(fingerprint: string): Promise<CachedGeminiInsight[] | null> {
    const raw = await this.redis.get(this.batchKey(fingerprint));
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as CachedGeminiInsight[];
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async set(fingerprint: string, insights: CachedGeminiInsight[]): Promise<void> {
    await this.redis.set(
      this.batchKey(fingerprint),
      JSON.stringify(insights),
      "EX",
      this.ttlSec,
    );
  }
}
