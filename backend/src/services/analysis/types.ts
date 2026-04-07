/**
 * Structured static-analysis output for one source file (STEP 4).
 */
export interface ExtractedFunction {
  name: string;
  /** Approximate McCabe cyclomatic complexity for this function subtree. */
  cyclomaticComplexity: number;
  /** Nodes inside the function subtree (size proxy). */
  approxNodeCount: number;
  /** Maximum nesting depth inside the function (block-like nodes). */
  maxNestingDepth: number;
}

export interface ExtractedClass {
  name: string;
  kind: "class" | "interface" | "enum";
}

export interface ExtractedImport {
  /** Raw module specifier (e.g. `react`, `./foo`, `../bar/baz`). */
  specifier: string;
  isExternal: boolean;
}

export interface CodeSmell {
  ruleId: string;
  severity: "info" | "warning" | "error";
  message: string;
  filePath: string;
  symbol?: string;
}

export interface FileAnalysisResult {
  path: string;
  language: string;
  functions: ExtractedFunction[];
  classes: ExtractedClass[];
  imports: ExtractedImport[];
  smells: CodeSmell[];
}

export interface DependencyEdge {
  from: string;
  to: string;
  kind: "imports";
}

export interface AnalysisSummary {
  fileCount: number;
  functionCount: number;
  classCount: number;
  importCount: number;
  avgCyclomaticComplexity: number;
  maxCyclomaticComplexity: number;
  smellCount: number;
}

export interface ProjectAnalysisPayload {
  summary: AnalysisSummary;
  files: FileAnalysisResult[];
  dependencyGraph: {
    nodes: string[];
    edges: DependencyEdge[];
  };
}
