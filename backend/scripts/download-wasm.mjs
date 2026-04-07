/**
 * Downloads Tree-sitter core + grammar WASM files into backend/wasm/.
 * Run: node scripts/download-wasm.mjs
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wasmDir = path.join(__dirname, "..", "wasm");

const FILES = [
  [
    "tree-sitter.wasm",
    "https://github.com/tree-sitter/tree-sitter/releases/download/v0.24.7/tree-sitter.wasm",
  ],
  [
    "tree-sitter-javascript.wasm",
    "https://unpkg.com/tree-sitter-javascript@0.25.0/tree-sitter-javascript.wasm",
  ],
  [
    "tree-sitter-typescript.wasm",
    "https://unpkg.com/tree-sitter-typescript@0.23.2/tree-sitter-typescript.wasm",
  ],
  [
    "tree-sitter-tsx.wasm",
    "https://unpkg.com/tree-sitter-typescript@0.23.2/tree-sitter-tsx.wasm",
  ],
  [
    "tree-sitter-python.wasm",
    "https://unpkg.com/tree-sitter-python@0.25.0/tree-sitter-python.wasm",
  ],
  [
    "tree-sitter-java.wasm",
    "https://unpkg.com/tree-sitter-java@0.23.5/tree-sitter-java.wasm",
  ],
  [
    "tree-sitter-cpp.wasm",
    "https://unpkg.com/tree-sitter-cpp@0.23.4/tree-sitter-cpp.wasm",
  ],
];

async function main() {
  await mkdir(wasmDir, { recursive: true });
  for (const [name, url] of FILES) {
    const dest = path.join(wasmDir, name);
    if (existsSync(dest)) {
      process.stdout.write(`Skip ${name} (already exists)\n`);
      continue;
    }
    process.stdout.write(`Downloading ${name}...\n`);
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(dest, buf);
  }
  process.stdout.write(`Done. WASM files in ${wasmDir}\n`);
}

await main();
