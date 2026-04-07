import path from "node:path";
import process from "node:process";
import Parser from "web-tree-sitter";

/**
 * Resolves the directory containing vendored *.wasm grammars.
 * Defaults to `<cwd>/wasm` (start the API from the `backend/` folder).
 * Override with env `AST_WASM_ROOT` for custom layouts.
 */
export function getWasmRoot(): string {
  const fromEnv = process.env.AST_WASM_ROOT?.trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }
  return path.resolve(process.cwd(), "wasm");
}

const GRAMMAR_WASM: Record<string, string> = {
  javascript: "tree-sitter-javascript.wasm",
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
  python: "tree-sitter-python.wasm",
  java: "tree-sitter-java.wasm",
  cpp: "tree-sitter-cpp.wasm",
  c: "tree-sitter-cpp.wasm",
};

let initPromise: Promise<void> | null = null;
const languageCache = new Map<string, Parser.Language>();

/**
 * Initializes the web-tree-sitter runtime (loads core tree-sitter.wasm from WASM_ROOT).
 */
export async function ensureTreeSitterInitialized(): Promise<void> {
  if (initPromise) {
    return initPromise;
  }
  initPromise = Parser.init({
    locateFile: (scriptName: string) => path.join(getWasmRoot(), scriptName),
  });
  return initPromise;
}

/**
 * Chooses the correct grammar WASM key from our scanner language + file extension.
 */
export function resolveGrammarKey(
  scannerLanguage: string,
  filePath: string,
): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".tsx") {
    return "tsx";
  }
  if (ext === ".ts") {
    return "typescript";
  }
  if (ext === ".jsx" || ext === ".js") {
    return "javascript";
  }
  if (ext === ".py") {
    return "python";
  }
  if (ext === ".java") {
    return "java";
  }
  if (ext === ".cpp") {
    return "cpp";
  }
  if (ext === ".c") {
    return "c";
  }
  switch (scannerLanguage) {
    case "javascript":
      return "javascript";
    case "typescript":
      return "typescript";
    case "python":
      return "python";
    case "java":
      return "java";
    case "cpp":
      return "cpp";
    case "c":
      return "c";
    default:
      return "javascript";
  }
}

/**
 * Loads (cached) Language WASM for the given scanner row + path.
 */
export async function loadLanguageForSource(
  scannerLanguage: string,
  filePath: string,
): Promise<Parser.Language> {
  await ensureTreeSitterInitialized();
  const key = resolveGrammarKey(scannerLanguage, filePath);
  const wasmFile = GRAMMAR_WASM[key];
  if (!wasmFile) {
    throw new Error(`No Tree-sitter grammar registered for key: ${key}`);
  }
  const cached = languageCache.get(wasmFile);
  if (cached) {
    return cached;
  }
  const fullPath = path.join(getWasmRoot(), wasmFile);
  const lang = await Parser.Language.load(fullPath);
  languageCache.set(wasmFile, lang);
  return lang;
}
