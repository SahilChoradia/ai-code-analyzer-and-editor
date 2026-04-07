import type { Env } from "../../config/env.js";
import type { FileAnalysisResult, CodeSmell } from "./types.js";
import { hasParseErrorFlag, hasTruncation } from "./astUtils.js";
import type { SerializedAstNode } from "../../utils/astSerializer.js";

/**
 * Applies heuristic rules on per-file analysis + raw AST flags.
 */
export function detectSmellsForFile(
  file: FileAnalysisResult,
  astRoot: SerializedAstNode,
  env: Env,
): CodeSmell[] {
  const smells: CodeSmell[] = [];

  if (hasTruncation(astRoot)) {
    smells.push({
      ruleId: "AST_TRUNCATED",
      severity: "warning",
      message:
        "AST was truncated during ingestion; metrics may be incomplete for this file.",
      filePath: file.path,
    });
  }

  if (hasParseErrorFlag(astRoot)) {
    smells.push({
      ruleId: "PARSE_ERROR_SUBTREE",
      severity: "warning",
      message:
        "Tree-sitter reported parse errors in this file; analysis may be unreliable.",
      filePath: file.path,
    });
  }

  for (const fn of file.functions) {
    if (fn.cyclomaticComplexity >= env.ANALYSIS_COMPLEXITY_ERROR_THRESHOLD) {
      smells.push({
        ruleId: "HIGH_CYCLOMATIC_COMPLEXITY",
        severity: "error",
        message: `Cyclomatic complexity ${fn.cyclomaticComplexity} exceeds error threshold (${env.ANALYSIS_COMPLEXITY_ERROR_THRESHOLD}).`,
        filePath: file.path,
        symbol: fn.name,
      });
    } else if (
      fn.cyclomaticComplexity >= env.ANALYSIS_COMPLEXITY_WARN_THRESHOLD
    ) {
      smells.push({
        ruleId: "ELEVATED_CYCLOMATIC_COMPLEXITY",
        severity: "warning",
        message: `Cyclomatic complexity ${fn.cyclomaticComplexity} exceeds warning threshold (${env.ANALYSIS_COMPLEXITY_WARN_THRESHOLD}).`,
        filePath: file.path,
        symbol: fn.name,
      });
    }

    if (fn.maxNestingDepth >= env.ANALYSIS_MAX_NESTING_DEPTH) {
      smells.push({
        ruleId: "DEEP_NESTING",
        severity: "warning",
        message: `Nesting depth ${fn.maxNestingDepth} exceeds threshold (${env.ANALYSIS_MAX_NESTING_DEPTH}).`,
        filePath: file.path,
        symbol: fn.name,
      });
    }

    if (fn.approxNodeCount >= env.ANALYSIS_LARGE_FUNCTION_NODES) {
      smells.push({
        ruleId: "LARGE_FUNCTION",
        severity: "info",
        message: `Function subtree has ~${fn.approxNodeCount} nodes (threshold ${env.ANALYSIS_LARGE_FUNCTION_NODES}).`,
        filePath: file.path,
        symbol: fn.name,
      });
    }
  }

  return smells;
}
