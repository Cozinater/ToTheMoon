import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/date-picker";
import { round2 } from "@shared/totals";
import type { Holding } from "@shared/schema";

/** holdingSchema.ticker caps at 12 chars, and cash reuses that field as its label. */
const LABEL_MAX = 12;

/**
 * Add/edit a cash line: readily deployable USD sitting in a brokerage account.
 * Nothing to quote, so there is no price box, no FX call and no strategy — cash is
 * dry powder, not an allocation.
 */
export function CashFields(props: {
  open: boolean;
  initial?: Holding;
  onSave: (holding: Holding) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [asOf, setAsOf] = useState("");

  useEffect(() => {
    if (!props.open) return;
    setLabel(props.initial?.ticker ?? "");
    setAmountStr(props.initial ? String(props.initial.valueUsd) : "");
    setAsOf(props.initial?.asOf ?? "");
  }, [props.open, props.initial]);

  const amount = Number(amountStr);
  const trimmed = label.trim();
  const canSave =
    trimmed !== "" && trimmed.length <= LABEL_MAX &&
    asOf !== "" && Number.isFinite(amount) && amount > 0;

  function save() {
    if (!canSave) return;
    // USD cash: one "unit" is one dollar, so quantity, price × quantity and value agree.
    const value = round2(amount);
    props.onSave({
      id: props.initial?.id ?? crypto.randomUUID(),
      ticker: trimmed,
      type: "cash",
      quantity: value,
      priceUsd: 1,
      valueUsd: value,
      asOf,
    });
    props.onClose();
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="cash-label">Label</Label>
        <Input
          id="cash-label" maxLength={LABEL_MAX} autoComplete="off" placeholder="e.g. IBKR USD"
          value={label} onChange={(e) => setLabel(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="cash-amount">Amount (USD)</Label>
          <Input
            id="cash-amount" type="number" inputMode="decimal" min="0" step="any" placeholder="0"
            value={amountStr} onChange={(e) => setAmountStr(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cash-asOf">As-of date</Label>
          <DatePicker id="cash-asOf" value={asOf} onChange={setAsOf} />
        </div>
      </div>

      <p className="rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        Brokerage cash only — bank balances belong under Assets.
      </p>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={props.onClose}>Cancel</Button>
        <Button onClick={save} disabled={!canSave}>Save cash</Button>
      </div>
    </div>
  );
}
