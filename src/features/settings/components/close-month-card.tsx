import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/date-picker";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api, ApiError } from "@/lib/api";
import { dateLabel, monthLabel, sgd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDraft } from "@/hooks/use-draft";
import { useCloseMonth, useSnapshots } from "@/hooks/use-snapshots";
import { computeTotals } from "@shared/totals";
import { closeMonthOptions, defaultCloseMonth, monthOf } from "../lib/close-month";

export function CloseMonthCard() {
  const { data: draft } = useDraft();
  const { data: snapshots } = useSnapshots();
  const close = useCloseMonth();
  const [snapshotDate, setSnapshotDate] = useState("");
  const [month, setMonth] = useState("");
  const [fxStr, setFxStr] = useState("");
  const [fxLoading, setFxLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const closedMonths = snapshots?.map((s) => s.month) ?? [];
  const monthClosed = month !== "" && closedMonths.includes(month);
  const canClose = snapshotDate !== "" && month !== "" && !monthClosed && !close.isPending;

  // Picking a date resets the month to the sensible default; the pills below let
  // the user override it.
  function pickDate(v: string) {
    setSnapshotDate(v);
    setMonth(v ? defaultCloseMonth(v, closedMonths) : "");
  }

  const fxNum = Number(fxStr);
  const fxValid = fxStr !== "" && Number.isFinite(fxNum) && fxNum > 0;
  const previewFx = fxValid ? fxNum : draft?.fxRate;
  const totals = draft ? computeTotals(draft, previewFx ?? 1) : null;
  const counts = draft
    ? {
        holdings: draft.holdings.length,
        assets: draft.assets.bankSavings.length + draft.assets.cpf.length + draft.assets.property.length,
        liabilities: draft.liabilities.creditCards.length + draft.liabilities.loans.length,
      }
    : null;

  async function fetchFx() {
    setFxLoading(true);
    setNote(null);
    try {
      const fx = await api<{ rate: number }>("/api/fx");
      setFxStr(String(fx.rate));
    } catch (err) {
      setNote({ kind: "err", text: err instanceof ApiError ? err.message : "Couldn't fetch the FX rate" });
    } finally {
      setFxLoading(false);
    }
  }

  function doClose() {
    setNote(null);
    close.mutate(
      { snapshotDate, month, fxRate: fxValid ? fxNum : undefined },
      {
        onSuccess: (snap) => {
          setNote({ kind: "ok", text: `${monthLabel(snap.month)} locked at USD/SGD ${snap.fxRate.toFixed(4)} — view it in History.` });
          setSnapshotDate("");
          setMonth("");
          setFxStr("");
        },
        onError: (err) => setNote({ kind: "err", text: err.message }),
      },
    );
  }

  return (
    <section className="surface rounded-3xl p-6">
      <div className="mb-5 flex items-center gap-3.5">
        <div className="flex size-11 items-center justify-center rounded-full bg-primary/12 text-primary">
          <Lock className="size-5" />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">Close month</h2>
          <p className="text-sm text-muted-foreground">
            Locks the current draft into a read-only snapshot. The draft carries forward into a new month.
          </p>
        </div>
      </div>

      {totals && counts && (
        <div className="mb-5 rounded-2xl border border-border/40 bg-secondary/40 px-5 py-4">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Current draft</div>
          <div className="mt-1 font-display text-3xl font-semibold tracking-tight text-cream">{sgd(totals.netWorthSgd)}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {counts.holdings} holdings · {counts.assets} assets · {counts.liabilities} liabilities
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="close-date">Snapshot date</Label>
          <DatePicker id="close-date" value={snapshotDate} onChange={pickDate} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="close-fx">USD/SGD rate</Label>
          <div className="flex gap-2">
            <Input id="close-fx" type="number" inputMode="decimal" min="0" step="any"
              placeholder="auto-fetch on close" value={fxStr} onChange={(e) => setFxStr(e.target.value)} />
            <Button variant="outline" onClick={fetchFx} disabled={fxLoading}>
              {fxLoading ? "Fetching…" : "Fetch"}
            </Button>
          </div>
        </div>
      </div>

      {snapshotDate !== "" && (
        <div className="mt-3 grid gap-1.5">
          <Label id="close-month-label">Belongs to</Label>
          <div role="group" aria-labelledby="close-month-label" className="flex flex-wrap items-center gap-1">
            {closeMonthOptions(snapshotDate).map((m) => {
              const closed = closedMonths.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonth(m)}
                  aria-pressed={month === m}
                  disabled={closed}
                  title={closed ? `${monthLabel(m)} is already closed` : undefined}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    "disabled:cursor-not-allowed disabled:line-through disabled:opacity-40",
                    month === m
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                >
                  {monthLabel(m)}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {monthClosed
              ? `${monthLabel(month)} is already closed — amend it from History instead.`
              : month !== monthOf(snapshotDate)
                ? `Filed as ${monthLabel(month)}, even though it's dated ${dateLabel(snapshotDate)}.`
                : "A snapshot taken on the 1st can be filed as the month that just ended."}
          </p>
        </div>
      )}

      {note && (
        <p className={note.kind === "ok" ? "mt-3 text-sm text-positive" : "mt-3 text-sm text-negative"}>
          {note.text}
        </p>
      )}

      <Button className="mt-5" disabled={!canClose} onClick={() => setConfirmOpen(true)}>
        <Lock className="size-4" /> {close.isPending ? "Closing…" : "Close month and snapshot"}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Close {month ? monthLabel(month) : "this month"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {snapshotDate && `Dated ${dateLabel(snapshotDate)}. `}
              The snapshot becomes read-only (amendable later from History).
              {!fxValid && " The USD/SGD rate will be fetched automatically."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doClose}>Close month</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
