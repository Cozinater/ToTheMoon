import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "@/routes/__root";
import { ErrorState } from "@/components/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { DraftCard } from "@/features/dashboard/components/draft-card";
import { NetWorthChart } from "@/features/dashboard/components/net-worth-chart";
import { NetWorthHero } from "@/features/dashboard/components/net-worth-hero";
import { SummaryCards } from "@/features/dashboard/components/summary-cards";
import { useDashboardData } from "@/features/dashboard/hooks/use-dashboard-data";

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
});

function DashboardPage() {
  const d = useDashboardData();

  if (d.isPending) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-24 w-80" />
        <Skeleton className="h-80 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
      </div>
    );
  }
  if (d.isError || !d.draft || !d.totals) {
    return <ErrorState message="Couldn't load your dashboard." onRetry={d.refetch} />;
  }

  return (
    <div className="grid gap-8">
      <div>
        <NetWorthHero value={d.totals.netWorthSgd} delta={d.delta} />
        {d.fxMissing && (
          <p className="mt-2 text-xs text-muted-foreground">
            No USD/SGD rate yet — portfolio shown at 1.0000. Fetch a price on Portfolio to update it.
          </p>
        )}
      </div>
      {d.points.length > 0 && <NetWorthChart points={d.points} />}
      <SummaryCards totals={d.totals} fxRate={d.fxRate} />
      <DraftCard draft={d.draft} />
    </div>
  );
}
