"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Loader } from "@/components/Loader";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getApiOrigin, getAuthMe } from "@/lib/api";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("error") === "oauth";
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await getAuthMe();
        if (cancelled) {
          return;
        }
        if (me.authenticated) {
          router.replace("/dashboard");
          return;
        }
      } catch {
        /* stay on login */
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const startGithubLogin = () => {
    window.location.href = `${getApiOrigin()}/auth/github`;
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader label="Loading…" size="md" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col px-4 py-12 sm:px-6">
      <div className="mb-8 flex justify-end">
        <ThemeToggle />
      </div>
      <div className="surface-card surface-card-hover flex flex-1 flex-col justify-center p-8 sm:p-10">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Sign in
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Connect GitHub to list your repositories and run analysis on the code
          you choose. Your access token stays on the server only.
        </p>
        {oauthError && (
          <div
            className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
            role="alert"
          >
            GitHub sign-in was cancelled or failed. Try again.
          </div>
        )}
        <button
          type="button"
          onClick={startGithubLogin}
          className="btn-primary mt-8 w-full py-3"
        >
          Continue with GitHub
        </button>
        <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
          We request <strong>read:user</strong> and <strong>repo</strong> so we
          can clone repositories you pick (including private repos you can
          access).
        </p>
      </div>
      <p className="mt-6 text-center text-xs text-slate-500">
        <Link href="/" className="text-blue-600 hover:underline dark:text-blue-400">
          Home
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader label="Loading…" size="md" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
