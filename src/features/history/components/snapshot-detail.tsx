import { useState } from "react";
import { PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ErrorState } from "@/components/error-state";
import { useSnapshot } from "@/hooks/use-snapshots";
import { monthLabel, sgd } from "@/lib/format";
import { HoldingsTable } from "@/features/portfolio/components/holdings-table";
import { SectionCard } from "@/features/assets/components/section-card";
import { ASSET_SECTIONS, LIABILITY_SECTIONS } from "@/features/assets/sections";
import { AmendDialog } from "./amend-dialog";

export function SnapshotDetail({ month }: { month: string }) {
  const { data: snap, isPending, isError, refetch } = useSnapshot(month);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [amendOpen, setAmendOpen] = useState(false);

  if (isPending) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (isError || !snap) return <ErrorState message="Couldn't load this snapshot." onRetry={() => refetch()} />;

  return (
    <div className="grid gap-4">
      {snap.holdings.length > 0 && <HoldingsTable holdings={snap.holdings} />}

      <div className="grid gap-4 md:grid-cols-2">
        {ASSET_SECTIONS.map((s) => snap.assets[s.key].length > 0 && (
          <SectionCard key={s.key} title={s.title} icon={s.icon} limit={s.limit}
            tone="asset" entries={snap.assets[s.key]} />
        ))}
        {LIABILITY_SECTIONS.map((s) => snap.liabilities[s.key].length > 0 && (
          <SectionCard key={s.key} title={s.title} icon={s.icon} limit={s.limit}
            tone="liability" entries={snap.liabilities[s.key]} />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/40 px-4 py-3">
        <div className="text-sm">
          <span className="text-muted-foreground">Net worth </span>
          <span className="font-semibold">{sgd(snap.totals.netWorthSgd)}</span>
          <span className="text-muted-foreground"> · at USD/SGD {snap.fxRate.toFixed(4)}</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
          <PencilLine className="size-4" /> Amend snapshot
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Amend {monthLabel(month)}?</AlertDialogTitle>
            <AlertDialogDescription>
              Closed months are read-only by default. Amending rewrites this month's history —
              its totals will be recalculated from whatever you change. Use this to fix human errors.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => setAmendOpen(true)}>Amend</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AmendDialog snapshot={snap} open={amendOpen} onOpenChange={setAmendOpen} />
    </div>
  );
}
