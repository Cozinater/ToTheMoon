import { useState } from "react";
import { createRoute } from "@tanstack/react-router";
import { ChartPie, Plus, RefreshCw } from "lucide-react";
import { rootRoute } from "@/routes/__root";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api, ApiError } from "@/lib/api";
import { usd } from "@/lib/format";
import { useDraft, useSaveDraft } from "@/hooks/use-draft";
import { round2 } from "@shared/totals";
import type { Holding } from "@shared/schema";
import { HoldingsTable } from "@/features/portfolio/components/holdings-table";
import { HoldingForm } from "@/features/portfolio/components/holding-form";
import type { FxResponse, QuoteBatch } from "@/features/portfolio/types";

export const portfolioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portfolio",
  component: PortfolioPage,
});

function PortfolioPage() {
  const { data: draft, isPending, isError, refetch } = useDraft();
  const save = useSaveDraft();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Holding | undefined>();
  const [deleting, setDeleting] = useState<Holding | undefined>();
  const [refreshing, setRefreshing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (isPending) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-16 w-72" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }
  if (isError || !draft) return <ErrorState message="Couldn't load your portfolio." onRetry={() => refetch()} />;

  const totalUsd = round2(draft.holdings.reduce((acc, h) => acc + h.valueUsd, 0));

  const upsert = (holding: Holding, fxRate?: number) => {
    const exists = draft.holdings.some((h) => h.id === holding.id);
    save.mutate({
      ...draft,
      holdings: exists
        ? draft.holdings.map((h) => (h.id === holding.id ? holding : h))
        : [...draft.holdings, holding],
      fxRate: fxRate ?? draft.fxRate,
    });
  };

  async function refreshPrices() {
    if (!draft || draft.holdings.length === 0 || refreshing) return;
    setRefreshing(true);
    setNote(null);
    try {
      const symbols = draft.holdings.map((h) => `${h.ticker}:${h.type}`).join(",");
      const [batch, fx] = await Promise.all([
        api<QuoteBatch>(`/api/quote?symbols=${encodeURIComponent(symbols)}`),
        api<FxResponse>("/api/fx"),
      ]);
      const holdings = draft.holdings.map((h) => {
        const q = batch.quotes.find((q) => q.symbol === h.ticker.toUpperCase() && q.type === h.type);
        return q ? { ...h, priceUsd: q.priceUsd, valueUsd: round2(h.quantity * q.priceUsd), asOf: q.asOf } : h;
      });
      save.mutate({ ...draft, holdings, fxRate: fx.rate });
      if (batch.failed.length > 0) setNote(`Couldn't refresh: ${batch.failed.join(", ")}`);
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : "Refresh failed — try again");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="PORTFOLIO (USD)"
        title={usd(totalUsd)}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={refreshPrices} disabled={draft.holdings.length === 0 || refreshing}>
              <RefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} /> Refresh prices
            </Button>
            <Button onClick={() => { setEditing(undefined); setFormOpen(true); }}>
              <Plus className="size-4" /> Add Holding
            </Button>
          </div>
        }
      />
      <p className="-mt-4 mb-6 text-sm text-muted-foreground">
        {draft.holdings.length} holdings · stored in USD, converted at the FX rate on close.
      </p>
      {note && <p className="mb-4 text-sm text-negative">{note}</p>}

      {draft.holdings.length === 0 ? (
        <EmptyState
          icon={ChartPie}
          title="No holdings yet"
          hint="Add your first stock, ETF, or crypto holding and we'll fetch its end-of-day USD price."
          action={<Button onClick={() => { setEditing(undefined); setFormOpen(true); }}><Plus className="size-4" /> Add your first holding</Button>}
        />
      ) : (
        <HoldingsTable
          holdings={draft.holdings}
          filterable
          onEdit={(h) => { setEditing(h); setFormOpen(true); }}
          onDelete={setDeleting}
        />
      )}

      <HoldingForm open={formOpen} onOpenChange={setFormOpen} initial={editing} onSave={upsert} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.ticker}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it from the current draft only — closed months are untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) save.mutate({ ...draft, holdings: draft.holdings.filter((h) => h.id !== deleting.id) });
                setDeleting(undefined);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
