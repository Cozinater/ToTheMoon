import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "@/routes/__root";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { IncomeChart } from "@/features/income/components/income-chart";
import { IncomeSummary } from "@/features/income/components/income-summary";
import { IncomeTable } from "@/features/income/components/income-table";
import { useIncome, useSaveIncome } from "@/features/income/hooks/use-income";
import { incomeSummary, withChanges } from "@/features/income/lib/income-stats";

export const incomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/income",
  component: IncomePage,
});

function IncomePage() {
  const { data, isPending, isError, refetch } = useIncome();
  const save = useSaveIncome();

  return (
    <>
      <PageHeader eyebrow="INCOME" title="Income growth" />

      {isPending && (
        <div className="grid gap-6">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-96 w-full rounded-3xl" />
        </div>
      )}
      {isError && <ErrorState message="Couldn't load your income." onRetry={() => refetch()} />}

      {data && (() => {
        const summary = incomeSummary(data.entries);
        return (
          <div className="grid gap-6">
            {summary && <IncomeSummary summary={summary} />}
            {data.entries.length > 0 && <IncomeChart rows={withChanges(data.entries)} />}
            <IncomeTable
              entries={data.entries}
              onSave={(entries) => save.mutate({ entries })}
              saving={save.isPending}
              saveError={save.isError ? save.error.message : null}
            />
          </div>
        );
      })()}
    </>
  );
}
