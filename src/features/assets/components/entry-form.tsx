import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveModal } from "@/components/responsive-modal";
import type { Entry } from "@shared/schema";
import { round2 } from "@shared/totals";

export function EntryForm(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Entry;
  sectionTitle: string;
  onSave: (entry: Entry) => void;
}) {
  const [name, setName] = useState("");
  const [balanceStr, setBalanceStr] = useState("");
  const [asOf, setAsOf] = useState("");

  useEffect(() => {
    if (!props.open) return;
    setName(props.initial?.name ?? "");
    setBalanceStr(props.initial ? String(props.initial.balanceSgd) : "");
    setAsOf(props.initial?.asOf ?? "");
  }, [props.open, props.initial]);

  const balance = Number(balanceStr);
  const canSave = name.trim() !== "" && asOf !== "" && Number.isFinite(balance) && balance >= 0;

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
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="entry-balance">Balance (SGD)</Label>
            <Input id="entry-balance" type="number" inputMode="decimal" min="0" step="any"
              value={balanceStr} onChange={(e) => setBalanceStr(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="entry-asof">As-of date</Label>
            <Input id="entry-asof" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </div>
        </div>
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
