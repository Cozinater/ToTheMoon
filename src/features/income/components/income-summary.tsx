import { motion } from "motion/react";
import { CalendarRange, TrendingUp, Wallet } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { dateLabel, monthLabel, sgd } from "@/lib/format";
import type { IncomeSummary as Summary } from "../lib/income-stats";

const signedPct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;

function Tile(props: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  value: ReactNode;
  note: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
      className="surface rounded-2xl p-4"
    >
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          {props.label}
        </span>
        <span className="flex size-9 items-center justify-center rounded-full bg-primary/12 text-primary">
          <Icon className="size-4" />
        </span>
      </div>
      <div className="text-xl font-semibold tracking-tight text-cream tabular-nums md:text-2xl">{props.value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{props.note}</div>
    </motion.div>
  );
}

export function IncomeSummary({ summary }: { summary: Summary }) {
  const { first, latest, totalGrowthPct, annualisedPct } = summary;
  return (
    <motion.div
      initial="hidden" animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      className="grid gap-3 sm:grid-cols-3"
    >
      <Tile label="Current income" icon={Wallet} value={sgd(latest.amountSgd)}
        note={`Since ${dateLabel(latest.date)}`} />
      <Tile label="Total growth" icon={TrendingUp}
        value={totalGrowthPct === null ? "—" : signedPct(totalGrowthPct)}
        note={totalGrowthPct === null
          ? "Add a second row to see growth"
          : `From ${sgd(first.amountSgd)} in ${monthLabel(first.date.slice(0, 7))}`} />
      <Tile label="Yearly growth" icon={CalendarRange}
        value={annualisedPct === null ? "—" : signedPct(annualisedPct)}
        note={annualisedPct === null ? "Needs at least a year of rows" : "Compounded per year"} />
    </motion.div>
  );
}
