"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { InlineLoader, Loader } from "@/components/Loader";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  ApiError,
  analyzeProject,
  getAuthMe,
  ingestGithubRepo,
  listGithubRepos,
  logoutSession,
} from "@/lib/api";
import type { GithubRepoSummary } from "@/types/api";

function splitFullName(fullName: string): { owner: string; repo: string } {
  const i = fullName.indexOf("/");
  if (i <= 0 || i === fullName.length - 1) {
    return { owner: "", repo: "" };
  }
  return {
    owner: fullName.slice(0, i),
    repo: fullName.slice(i + 1),
  };
}

export default function DashboardReposPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [analyzePhase, setAnalyzePhase] = useState<string | null>(null);

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getAuthMe,
  });

  const reposQuery = useQuery({
    queryKey: ["github", "repos"],
    queryFn: listGithubRepos,
    enabled: meQuery.data?.authenticated === true,
  });

  const onLogout = useCallback(async () => {
    setError(null);
    try {
      await logoutSession();
      await queryClient.invalidateQueries({ queryKey: ["auth"] });
      router.replace("/login");
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : "Sign out failed");
    }
  }, [queryClient, router]);

  const ingestMut = useMutation({
    mutationFn: async (r: GithubRepoSummary) => {
      const { owner, repo } = splitFullName(r.fullName);
      if (!owner || !repo) {
        throw new ApiError("BAD_REQUEST", "Invalid repository name");
      }
      const ingest = await ingestGithubRepo(owner, repo);
      if (!ingest.analyzed) {
        await analyzeProject(ingest.projectId, (p) => setAnalyzePhase(p.phase));
      }
      return ingest.projectId;
    },
    onSuccess: (projectId) => {
      setError(null);
      setAnalyzePhase(null);
      router.push(`/dashboard/${projectId}`);
    },
    onError: (e: unknown) => {
      setAnalyzePhase(null);
      setError(
        e instanceof ApiError
          ? e.message
          : "Could not ingest or analyze this repository.",
      );
    },
  });

  if (meQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader label="Loading session…" size="lg" />
      </div>
    );
  }

  if (!meQuery.data?.authenticated) {
    router.replace("/login");
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader label="Redirecting…" size="md" />
      </div>
    );
  }

  const user = meQuery.data.user;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/85">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Home
            </Link>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Your repositories
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              {user.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar}
                  alt=""
                  width={28}
                  height={28}
                  className="h-7 w-7 rounded-full"
                />
              ) : null}
              <span className="font-medium">{user.username}</span>
            </div>
            <ThemeToggle />
            <button
              type="button"
              onClick={() => void onLogout()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {error && (
          <div
            className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            role="alert"
          >
            {error}
          </div>
        )}

        {reposQuery.isPending && (
          <Loader label="Loading repositories from GitHub…" size="md" />
        )}

        {reposQuery.isError && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {reposQuery.error instanceof ApiError
              ? reposQuery.error.message
              : "Failed to load repositories."}
          </p>
        )}

        {reposQuery.data && reposQuery.data.repos.length === 0 && (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No repositories returned for this account. Create or fork a repo on
            GitHub, then refresh this page.
          </p>
        )}

        {reposQuery.data && reposQuery.data.repos.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2">
            {reposQuery.data.repos.map((r) => (
              <li key={r.fullName}>
                <button
                  type="button"
                  disabled={ingestMut.isPending}
                  onClick={() => ingestMut.mutate(r)}
                  className="surface-card surface-card-hover w-full p-5 text-left transition-all disabled:opacity-60"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {r.fullName}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                        r.visibility === "private"
                          ? "bg-amber-200/80 text-amber-950 dark:bg-amber-900/50 dark:text-amber-100"
                          : "bg-slate-200/80 text-slate-800 dark:bg-slate-700 dark:text-slate-100"
                      }`}
                    >
                      {r.visibility}
                    </span>
                  </div>
                  {r.description ? (
                    <p className="mt-2 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
                      {r.description}
                    </p>
                  ) : null}
                  <p className="mt-2 text-[10px] text-slate-500">
                    Default branch:{" "}
                    <span className="font-mono">{r.defaultBranch}</span>
                  </p>
                  <p className="mt-3 text-xs font-medium text-blue-600 dark:text-blue-400">
                    {ingestMut.isPending ? "Working…" : "Select → clone & analyze"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}

        {ingestMut.isPending && (
          <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm">
            <div className="surface-card max-w-sm p-6 text-center shadow-xl">
              <InlineLoader />
              <p className="mt-3 text-sm font-medium text-slate-800 dark:text-slate-100">
                Cloning and analyzing…
              </p>
              {analyzePhase && (
                <p className="mt-1 text-xs text-slate-500">
                  Phase: {analyzePhase}
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
