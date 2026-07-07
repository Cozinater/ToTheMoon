import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import type { SnapshotSummary } from "@/hooks/use-snapshots";
import { dateLabel, sgd } from "@/lib/format";
import { SnapshotDetail } from "./snapshot-detail";

export function SnapshotRow(props: { summary: SnapshotSummary; expanded: boolean; onToggle: () => void }) {
  const s = props.summary;
  return (
    <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <button onClick={props.onToggle} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        aria-expanded={props.expanded}>
        <div>
          <div className="font-medium">{dateLabel(s.snapshotDate)}</div>
          <div className="text-xs text-muted-foreground">FX USD/SGD: {s.fxRate.toFixed(4)}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Net worth</div>
            <div className="text-lg font-semibold">{sgd(s.totals.netWorthSgd)}</div>
          </div>
          <motion.span animate={{ rotate: props.expanded ? 180 : 0 }}>
            <ChevronDown className="size-4 text-muted-foreground" />
          </motion.span>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {props.expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 28 }}
          >
            <div className="border-t border-border/40 p-5">
              <SnapshotDetail month={s.month} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
