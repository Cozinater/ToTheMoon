import { useState } from "react";
import { createRoute } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { rootRoute } from "@/routes/__root";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useSnapshots } from "@/hooks/use-snapshots";
import { SnapshotRow } from "@/features/history/components/snapshot-row";

export const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history",
  component: HistoryPage,
});

function HistoryPage() {
  const { data: snapshots, isPending, isError, refetch } = useSnapshots();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <>
      <PageHeader eyebrow="HISTORY" title="Monthly snapshots" />
      <p className="-mt-4 mb-6 text-sm text-muted-foreground">
        Past snapshots are read-only and preserve the FX rate used at close. Use Amend to fix mistakes.
      </p>

      {isPending && <div className="grid gap-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>}
      {isError && <ErrorState message="Couldn't load your history." onRetry={() => refetch()} />}

      {snapshots && (snapshots.length === 0 ? (
        <EmptyState icon={Clock} title="No snapshots yet"
          hint="Close your first month from Settings to start your timeline." />
      ) : (
        <div className="grid gap-3">
          {snapshots.map((s) => (
            <SnapshotRow key={s.month} summary={s} expanded={expanded === s.month}
              onToggle={() => setExpanded(expanded === s.month ? null : s.month)} />
          ))}
        </div>
      ))}
    </>
  );
}
