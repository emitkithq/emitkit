import { Skeleton } from "@heroui/react";

/**
 * Placeholder rows shaped like a managed list (projects, channels), so the
 * page keeps its layout while it loads.
 */
export const ListSkeleton = ({ rows = 4 }: { rows?: number }) => (
  <output
    aria-label="Loading"
    className="bg-surface border-border flex flex-col rounded-2xl border"
  >
    {Array.from({ length: rows }, (_, index) => (
      <div
        className="border-separator flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
        key={index}
      >
        <Skeleton className="size-10 shrink-0 rounded-xl" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-3.5 w-2/5 rounded-md" />
          <Skeleton className="h-3 w-3/5 rounded-md" />
        </div>
      </div>
    ))}
  </output>
);
