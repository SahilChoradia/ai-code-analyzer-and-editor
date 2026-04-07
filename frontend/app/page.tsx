"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader } from "@/components/Loader";
import { getAuthMe } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();

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
        } else {
          router.replace("/login");
        }
      } catch {
        if (!cancelled) {
          router.replace("/login");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
      <Loader label="Checking session…" size="lg" />
    </div>
  );
}
