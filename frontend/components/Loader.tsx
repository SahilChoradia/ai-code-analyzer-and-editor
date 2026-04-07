"use client";

export function Loader({
  label = "Loading…",
  size = "md",
}: {
  label?: string;
  size?: "sm" | "md" | "lg";
}) {
  const ring =
    size === "sm"
      ? "h-6 w-6 border-2"
      : size === "lg"
        ? "h-12 w-12 border-[3px]"
        : "h-9 w-9 border-2";

  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-8"
      role="status"
      aria-live="polite"
    >
      <div
        className={`${ring} animate-spin rounded-full border-slate-200 border-t-blue-600 dark:border-slate-700 dark:border-t-blue-400`}
      />
      <p className="text-sm text-slate-600 dark:text-slate-400">{label}</p>
    </div>
  );
}

export function InlineLoader() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600 dark:border-slate-600 dark:border-t-blue-400"
      aria-hidden
    />
  );
}
