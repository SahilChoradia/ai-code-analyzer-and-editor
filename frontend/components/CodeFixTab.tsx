"use client";

import { DiffEditor } from "@monaco-editor/react";
import type { Monaco } from "@monaco-editor/react";
import type * as MonacoEditor from "monaco-editor";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  getAuthMe,
  getProjectFileContent,
  postAiFixPreview,
  pushProjectChanges,
  saveProjectFile,
} from "@/lib/api";
import {
  aggregateIssues,
  guessLineFromMessage,
  type AggregatedIssueRow,
} from "@/lib/aggregatedIssues";
import { FixFileTree } from "@/components/FixFileTree";
import type {
  AiFileInsight,
  AiFixPreviewResponse,
  AnalysisPayload,
  ProjectFile,
  ProjectRecord,
} from "@/types/api";

type Props = {
  projectId: string;
  project: ProjectRecord;
  analysis: AnalysisPayload | null;
  aiInsights: AiFileInsight[];
};

function monacoLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    mts: "typescript",
    cts: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    json: "json",
    md: "markdown",
    css: "css",
    scss: "scss",
    less: "less",
    html: "html",
    vue: "html",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    kt: "kotlin",
    cs: "csharp",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    h: "cpp",
    hpp: "cpp",
    c: "c",
    rb: "ruby",
    php: "php",
    swift: "swift",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    sql: "sql",
    sh: "shell",
    bash: "shell",
    ps1: "powershell",
  };
  return map[ext] ?? "plaintext";
}

function useHtmlDarkClass(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () =>
      document.documentElement.classList.contains("dark");
    setDark(read());
    const obs = new MutationObserver(() => setDark(read()));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);
  return dark;
}

function IssueListItem({
  label,
  severity,
  line,
  onSelect,
  active,
}: {
  label: string;
  severity: string;
  line: number | null;
  onSelect: () => void;
  active: boolean;
}) {
  const sevClass =
    severity === "error"
      ? "text-red-600 dark:text-red-400"
      : severity === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : "text-slate-600 dark:text-slate-400";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors ${
        active
          ? "border-violet-500 bg-violet-50 dark:border-violet-400 dark:bg-violet-950/40"
          : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900/50 dark:hover:bg-slate-800"
      }`}
    >
      <span className={sevClass}>
        [{severity}]
        {line != null ? ` L${line}` : ""}
      </span>{" "}
      <span className="text-slate-800 dark:text-slate-200">{label}</span>
    </button>
  );
}

function IssueFileCard({
  row,
  selectedPath,
  focusedLine,
  onOpen,
  onFocusLine,
}: {
  row: AggregatedIssueRow;
  selectedPath: string | null;
  focusedLine: number | null;
  onOpen: (path: string) => void;
  onFocusLine: (path: string, line: number | null) => void;
}) {
  const active = selectedPath === row.path;
  return (
    <div
      className={`rounded-lg border p-3 text-left ${
        active
          ? "border-blue-500 bg-blue-50/80 dark:border-blue-400 dark:bg-blue-950/30"
          : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/50"
      }`}
    >
      <button
        type="button"
        className="w-full text-left"
        onClick={() => onOpen(row.path)}
      >
        <div className="font-mono text-[11px] font-semibold text-slate-900 dark:text-slate-100">
          {row.path}
        </div>
      </button>
      <div className="mt-2 space-y-1">
        {row.smells.map((s, i) => (
          <IssueListItem
            key={`${s.ruleId}-${i}`}
            label={s.message}
            severity={s.severity}
            line={s.line}
            active={active && focusedLine === s.line}
            onSelect={() => {
              onOpen(row.path);
              onFocusLine(row.path, s.line);
            }}
          />
        ))}
        {row.aiIssues.map((t, i) => (
          <IssueListItem
            key={`ai-${i}`}
            label={t}
            severity="warning"
            line={guessLineFromMessage(t)}
            active={
              active &&
              focusedLine === guessLineFromMessage(t)
            }
            onSelect={() => {
              const ln = guessLineFromMessage(t);
              onOpen(row.path);
              onFocusLine(row.path, ln);
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function CodeFixTab({
  projectId,
  project,
  analysis,
  aiInsights,
}: Props) {
  const dark = useHtmlDarkClass();
  const queryClient = useQueryClient();
  const diffEditorRef = useRef<MonacoEditor.editor.IStandaloneDiffEditor | null>(
    null,
  );

  const authQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getAuthMe,
    staleTime: 60_000,
  });

  const canEdit =
    authQuery.data?.authenticated === true &&
    project.sourceType === "github" &&
    Boolean(project.userId) &&
    authQuery.data.user.id === project.userId;

  const issueRows = aggregateIssues(analysis, aiInsights);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [focusedLine, setFocusedLine] = useState<number | null>(null);
  const [originalCode, setOriginalCode] = useState("");
  const [modifiedCode, setModifiedCode] = useState("");
  const [preview, setPreview] = useState<AiFixPreviewResponse | null>(null);
  const [banner, setBanner] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [commitMessage, setCommitMessage] = useState(
    "fix: apply edits from AI Code Engine",
  );
  const [newBranch, setNewBranch] = useState("");

  const suppressNextPreviewRef = useRef(false);

  const fileQuery = useQuery({
    queryKey: ["file-content", projectId, selectedPath],
    queryFn: () => getProjectFileContent(projectId, selectedPath!),
    enabled: Boolean(canEdit && selectedPath),
  });

  const previewMutation = useMutation({
    mutationFn: (path: string) => postAiFixPreview(projectId, path),
    onError: (err: unknown) => {
      const msg =
        err instanceof ApiError ? err.message : "AI fix preview failed.";
      setBanner({ kind: "error", text: msg });
    },
  });

  useEffect(() => {
    if (!canEdit || !selectedPath) {
      return;
    }
    if (!fileQuery.isSuccess || fileQuery.isFetching) {
      return;
    }
    const d = fileQuery.data;
    if (!d || d.path !== selectedPath) {
      return;
    }
    if (suppressNextPreviewRef.current) {
      suppressNextPreviewRef.current = false;
      setOriginalCode(d.content);
      setModifiedCode(d.content);
      return;
    }
    setOriginalCode(d.content);
    setModifiedCode(d.content);
    setPreview(null);
    setBanner(null);
    previewMutation.mutate(selectedPath, {
      onSuccess: (data) => {
        setPreview(data);
        setOriginalCode(data.originalCode);
        setModifiedCode(data.updatedCode);
        setBanner(
          data.aiGenerated
            ? null
            : {
                kind: "error",
                text: data.explanation,
              },
        );
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- previewMutation stable; avoid loop on data ref
  }, [
    canEdit,
    selectedPath,
    fileQuery.isSuccess,
    fileQuery.isFetching,
    fileQuery.data?.path,
    fileQuery.dataUpdatedAt,
  ]);

  useEffect(() => {
    if (!fileQuery.isError || !fileQuery.error) {
      return;
    }
    const msg =
      fileQuery.error instanceof ApiError
        ? fileQuery.error.message
        : "Failed to load file from server.";
    setBanner({ kind: "error", text: msg });
  }, [fileQuery.isError, fileQuery.error]);

  useEffect(() => {
    const ed = diffEditorRef.current;
    if (!ed || focusedLine == null || focusedLine < 1) {
      return;
    }
    const modified = ed.getModifiedEditor();
    modified.revealLineInCenter(focusedLine);
    modified.setPosition({ lineNumber: focusedLine, column: 1 });
  }, [focusedLine, preview, modifiedCode, originalCode]);

  const openFile = useCallback((path: string) => {
    const n = path.replace(/\\/g, "/");
    setSelectedPath(n);
    setFocusedLine(null);
  }, []);

  const focusLine = useCallback((path: string, line: number | null) => {
    setSelectedPath(path.replace(/\\/g, "/"));
    setFocusedLine(line);
  }, []);

  const handleDiffMount = useCallback(
    (editor: MonacoEditor.editor.IStandaloneDiffEditor, _monaco: Monaco) => {
      diffEditorRef.current = editor;
      editor.getOriginalEditor().updateOptions({ readOnly: true });
      const mod = editor.getModifiedEditor();
      mod.updateOptions({ readOnly: false });
      mod.onDidChangeModelContent(() => {
        setModifiedCode(mod.getValue());
      });
    },
    [],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPath) {
        throw new Error("No file selected");
      }
      return saveProjectFile(projectId, selectedPath, modifiedCode);
    },
    onSuccess: async (_, __) => {
      setBanner({ kind: "success", text: "Saved to server workspace." });
      suppressNextPreviewRef.current = true;
      setPreview(null);
      queryClient.setQueryData(
        ["file-content", projectId, selectedPath],
        (old: { content: string; path: string } | undefined) =>
          old
            ? { ...old, content: modifiedCode }
            : { path: selectedPath!, content: modifiedCode },
      );
      setOriginalCode(modifiedCode);
      setModifiedCode(modifiedCode);
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof ApiError ? err.message : "Save failed unexpectedly.";
      setBanner({ kind: "error", text: msg });
    },
  });

  const pushMutation = useMutation({
    mutationFn: async () => {
      return pushProjectChanges(projectId, {
        message: commitMessage,
        branch: newBranch.trim() || undefined,
      });
    },
    onSuccess: (data) => {
      const short = data.commitSha ? data.commitSha.slice(0, 7) : "";
      setBanner({
        kind: "success",
        text: `Pushed to GitHub (branch ${data.branch}${short ? `, ${short}` : ""}).`,
      });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof ApiError ? err.message : "Push failed unexpectedly.";
      setBanner({ kind: "error", text: msg });
    },
  });

  const dirty =
    Boolean(selectedPath) && originalCode !== "" && modifiedCode !== originalCode;

  const fileOptions: ProjectFile[] = project.files ?? [];

  const refreshPreview = useCallback(() => {
    if (!selectedPath || !canEdit) {
      return;
    }
    setBanner(null);
    previewMutation.mutate(selectedPath, {
      onSuccess: (data) => {
        setPreview(data);
        setOriginalCode(data.originalCode);
        setModifiedCode(data.updatedCode);
      },
    });
  }, [selectedPath, canEdit, previewMutation]);

  return (
    <div className="mx-auto max-w-[1800px] gap-3 px-4 pb-10 lg:flex lg:min-h-[min(78vh,820px)] lg:flex-row">
      {/* LEFT: file tree */}
      <aside className="mb-4 w-full shrink-0 space-y-2 lg:mb-0 lg:w-56 lg:min-w-[200px]">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Files
        </h2>
        <FixFileTree
          files={fileOptions}
          selectedPath={selectedPath}
          onSelectFile={openFile}
        />
        <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
          Quick open
        </label>
        <select
          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          value={selectedPath ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v) {
              openFile(v);
            }
          }}
        >
          <option value="">Choose…</option>
          {fileOptions.map((f) => (
            <option key={f.path} value={f.path.replace(/\\/g, "/")}>
              {f.path}
            </option>
          ))}
        </select>
      </aside>

      {/* CENTER: diff */}
      <section className="min-w-0 flex-1 space-y-2">
        {banner && (
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              banner.kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
                : "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
            }`}
          >
            {banner.text}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
            {selectedPath ?? "No file selected"}
          </span>
          {fileQuery.isFetching && (
            <span className="text-xs text-slate-500">Loading file…</span>
          )}
          {previewMutation.isPending && (
            <span className="text-xs text-violet-600 dark:text-violet-400">
              Generating AI diff…
            </span>
          )}
          {preview?.aiGenerated && (
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">
              AI suggestion loaded
            </span>
          )}
          {dirty && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">
              Modified side differs from original
            </span>
          )}
          {canEdit && selectedPath && (
            <button
              type="button"
              className="ml-auto text-xs font-medium text-violet-600 hover:underline dark:text-violet-400"
              disabled={previewMutation.isPending}
              onClick={refreshPreview}
            >
              Refresh AI fix
            </button>
          )}
        </div>

        <div className="min-h-[420px] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          {canEdit && selectedPath ? (
            <DiffEditor
              height="min(58vh, 600px)"
              language={monacoLanguage(selectedPath)}
              theme={dark ? "vs-dark" : "light"}
              original={originalCode}
              modified={modifiedCode}
              onMount={handleDiffMount}
              options={{
                renderSideBySide: true,
                readOnly: false,
                minimap: { enabled: true },
                fontSize: 13,
                wordWrap: "on",
                scrollBeyondLastLine: false,
              }}
            />
          ) : (
            <div className="flex h-[420px] items-center justify-center bg-slate-100 text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              {!canEdit
                ? "Sign in with GitHub and open a repo you imported to use the diff editor."
                : "Select a file from the tree."}
            </div>
          )}
        </div>

        <p className="text-[10px] text-slate-500 dark:text-slate-400">
          Left: original from repo workspace. Right: AI-suggested version (editable).
          Green/red highlights are from Monaco diff.
        </p>

        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/50 sm:flex-row sm:flex-wrap sm:items-end">
          <button
            type="button"
            disabled={!canEdit || !selectedPath || !dirty || saveMutation.isPending}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "Saving…" : "Save (right side)"}
          </button>
          <div className="flex min-w-[180px] flex-1 flex-col gap-1">
            <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
              Commit message
            </label>
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              className="rounded-md border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
          <div className="flex min-w-[140px] flex-col gap-1">
            <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
              New branch
            </label>
            <input
              type="text"
              placeholder="optional"
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
              className="rounded-md border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
          <button
            type="button"
            disabled={!canEdit || pushMutation.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            onClick={() => pushMutation.mutate()}
          >
            {pushMutation.isPending ? "Pushing…" : "Push to GitHub"}
          </button>
        </div>
      </section>

      {/* RIGHT: issues + AI explanation */}
      <aside className="w-full shrink-0 space-y-3 lg:w-80 lg:min-w-[280px]">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Errors &amp; AI fix
        </h2>
        {!canEdit && authQuery.isFetched && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            {authQuery.data?.authenticated
              ? "Diff and AI fix require a GitHub repo you imported with this account."
              : "Sign in with GitHub to load the workspace and AI suggestions."}
          </div>
        )}

        <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
          <h3 className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
            Issues by file
          </h3>
          {issueRows.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No aggregated issues. Open a file to run analysis-backed preview.
            </p>
          ) : (
            issueRows.map((row) => (
              <IssueFileCard
                key={row.path}
                row={row}
                selectedPath={selectedPath}
                focusedLine={focusedLine}
                onOpen={openFile}
                onFocusLine={focusLine}
              />
            ))
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/50">
          <h3 className="text-[10px] font-bold uppercase text-violet-700 dark:text-violet-300">
            What the AI changed
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-700 dark:text-slate-300">
            {preview?.whatChanged?.trim() ||
              "Select a file to generate an AI fix preview."}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/50">
          <h3 className="text-[10px] font-bold uppercase text-slate-600 dark:text-slate-400">
            Why it was changed
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-700 dark:text-slate-300">
            {preview?.whyChanged?.trim() ||
              preview?.explanation?.trim() ||
              "Explanation appears after the AI fix preview runs."}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/50">
          <h3 className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">
            Improvement summary
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
            {preview?.improvementSummary?.trim() ||
              "One-line summary from the model will show here."}
          </p>
        </div>

        {preview && preview.issues.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/50">
            <h3 className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
              Structured issues (API)
            </h3>
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-[11px] text-slate-600 dark:text-slate-400">
              {preview.issues.map((iss, i) => (
                <li key={`p-${i}`}>
                  <button
                    type="button"
                    className="w-full text-left hover:text-violet-600 dark:hover:text-violet-400"
                    onClick={() => {
                      if (iss.line != null) {
                        setFocusedLine(iss.line);
                      }
                    }}
                  >
                    <span className="font-medium">[{iss.source}]</span>{" "}
                    {iss.line != null ? `L${iss.line} ` : ""}
                    {iss.message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
