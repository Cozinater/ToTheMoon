import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ResponsiveModal } from "@/components/responsive-modal";
import type { Holding } from "@shared/schema";
import { isCash, isInstrument } from "../lib/cash";
import { CashFields } from "./cash-fields";
import { InstrumentFields } from "./instrument-fields";

type Mode = "instrument" | "cash";

const MODES: { value: Mode; label: string }[] = [
  { value: "instrument", label: "Instrument" },
  { value: "cash", label: "Cash" },
];

const DESCRIPTION: Record<Mode, string> = {
  instrument: "Pick an instrument and we'll fetch its latest USD price.",
  cash: "Record deployable cash sitting in your brokerage account.",
};

export function HoldingForm(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Holding;
  onSave: (holding: Holding, fxRate?: number) => void;
}) {
  // Owned by the shell because it gates the modal's own Escape handling: with the
  // combobox list open, Escape should close the list, not the whole dialog.
  const [listOpen, setListOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("instrument");
  const initial = props.initial;

  // Editing is locked to the row's own kind — a stock never becomes cash.
  useEffect(() => {
    if (props.open) setMode(initial && isCash(initial) ? "cash" : "instrument");
  }, [props.open, initial]);

  const close = () => props.onOpenChange(false);

  return (
    <ResponsiveModal
      open={props.open}
      onOpenChange={props.onOpenChange}
      onEscapeKeyDown={(e) => { if (listOpen) e.preventDefault(); }}
      title={initial ? `Edit ${initial.ticker}` : "Add holding"}
      description={DESCRIPTION[mode]}
    >
      <div className="grid gap-4">
        {/* Two buttons rather than a new shadcn primitive — same active/inactive
            pattern as the holdings table's type tabs. Hidden when editing, since
            the mode is fixed by the row being edited. */}
        {!initial && (
          <div className="flex gap-1">
            {MODES.map((m) => (
              <Button
                key={m.value} size="sm" variant={mode === m.value ? "secondary" : "ghost"}
                onClick={() => setMode(m.value)}
              >
                {m.label}
              </Button>
            ))}
          </div>
        )}

        {mode === "cash" ? (
          <CashFields open={props.open} initial={initial} onSave={props.onSave} onClose={close} />
        ) : (
          <InstrumentFields
            open={props.open}
            initial={initial && isInstrument(initial) ? initial : undefined}
            onListOpenChange={setListOpen}
            onSave={props.onSave}
            onClose={close}
          />
        )}
      </div>
    </ResponsiveModal>
  );
}
