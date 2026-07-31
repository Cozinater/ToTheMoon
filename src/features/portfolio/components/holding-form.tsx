import { useState } from "react";
import { ResponsiveModal } from "@/components/responsive-modal";
import type { Holding } from "@shared/schema";
import { isInstrument } from "../lib/cash";
import { InstrumentFields } from "./instrument-fields";

export function HoldingForm(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Holding;
  onSave: (holding: Holding, fxRate?: number) => void;
}) {
  // Owned by the shell because it gates the modal's own Escape handling: with the
  // combobox list open, Escape should close the list, not the whole dialog.
  const [listOpen, setListOpen] = useState(false);
  const initial = props.initial;

  return (
    <ResponsiveModal
      open={props.open}
      onOpenChange={props.onOpenChange}
      onEscapeKeyDown={(e) => { if (listOpen) e.preventDefault(); }}
      title={initial ? `Edit ${initial.ticker}` : "Add holding"}
      description="Pick an instrument and we'll fetch its latest USD price."
    >
      <InstrumentFields
        open={props.open}
        initial={initial && isInstrument(initial) ? initial : undefined}
        onListOpenChange={setListOpen}
        onSave={props.onSave}
        onClose={() => props.onOpenChange(false)}
      />
    </ResponsiveModal>
  );
}
