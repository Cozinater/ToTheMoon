import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/date-picker";
import { ResponsiveModal } from "@/components/responsive-modal";
import type { Entry } from "@shared/schema";
import { loanOwed, round2 } from "@shared/totals";
import { sgd } from "@/lib/format";
import { toYmd } from "@/lib/date";

export function EntryForm(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Entry;
  sectionTitle: string;
  /** Loans are entered as initial amount × percentage instead of a balance. */
  loan?: boolean;
  onSave: (entry: Entry) => void;
}) {
  const [name, setName] = useState("");
  const [balanceStr, setBalanceStr] = useState("");
  const [asOf, setAsOf] = useState("");
  const [principalStr, setPrincipalStr] = useState("");
  const [percentStr, setPercentStr] = useState("");

  useEffect(() => {
    if (!props.open) return;
    setName(props.initial?.name ?? "");
    setBalanceStr(props.initial ? String(props.initial.balanceSgd) : "");
    setAsOf(props.initial?.asOf ?? "");
    setPrincipalStr(props.initial?.principalSgd !== undefined ? String(props.initial.principalSgd) : "");
    setPercentStr(props.initial?.percent !== undefined ? String(props.initial.percent) : "");
  }, [props.open, props.initial]);

  // Changing the amount means the figure is fresh, so it is as of today.
  const editAmount = (set: (value: string) => void) => (value: string) => {
    set(value);
    setAsOf(toYmd(new Date()));
  };

  const filled = (str: string) => str.trim() !== "" && Number.isFinite(Number(str)) && Number(str) >= 0;
  const principal = round2(Number(principalStr));
  const percent = Number(percentStr);
  const loanReady = filled(principalStr) && filled(percentStr);
  const balance = props.loan ? (loanReady ? loanOwed(principal, percent) : NaN) : Number(balanceStr);
  const canSave = name.trim() !== "" && asOf !== "" && Number.isFinite(balance) && balance >= 0;
  // An old loan saved as a plain balance, before initial amount × percentage existed.
  const legacyBalance = props.loan && props.initial && props.initial.principalSgd === undefined
    ? props.initial.balanceSgd : undefined;

  return (
    <ResponsiveModal
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.initial ? `Edit ${props.initial.name}` : `Add to ${props.sectionTitle}`}
      description="Balances are in SGD."
    >
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="entry-name">Name</Label>
          <Input id="entry-name" placeholder="DBS Multiplier" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {props.loan ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="entry-principal">Initial amount (SGD)</Label>
                <Input id="entry-principal" type="number" inputMode="decimal" min="0" step="any"
                  value={principalStr} onChange={(e) => editAmount(setPrincipalStr)(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="entry-percent">Percentage (%)</Label>
                <Input id="entry-percent" type="number" inputMode="decimal" min="0" step="any"
                  placeholder="100" value={percentStr} onChange={(e) => editAmount(setPercentStr)(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="entry-asof">As-of date</Label>
                <DatePicker id="entry-asof" value={asOf} onChange={setAsOf} />
              </div>
              <div className="grid gap-1.5">
                <span className="text-sm font-medium">Amount owed</span>
                <div className="flex h-9 items-center font-display text-lg font-semibold tabular-nums" aria-live="polite">
                  {loanReady ? sgd(balance) : "—"}
                </div>
              </div>
            </div>
            {legacyBalance !== undefined && (
              <p className="text-sm text-muted-foreground">
                Saved before as {sgd(legacyBalance)}. Enter the initial amount and percentage to work it out from now on.
              </p>
            )}
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="entry-balance">Balance (SGD)</Label>
              <Input id="entry-balance" type="number" inputMode="decimal" min="0" step="any"
                value={balanceStr} onChange={(e) => editAmount(setBalanceStr)(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="entry-asof">As-of date</Label>
              <DatePicker id="entry-asof" value={asOf} onChange={setAsOf} />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!canSave}
            onClick={() => {
              props.onSave({
                id: props.initial?.id ?? crypto.randomUUID(),
                name: name.trim(),
                balanceSgd: round2(balance),
                asOf,
                ...(props.loan ? { principalSgd: principal, percent } : {}),
              });
              props.onOpenChange(false);
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
