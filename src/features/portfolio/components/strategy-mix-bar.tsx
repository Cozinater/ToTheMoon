import { useMemo } from "react";
import { useSettings } from "@/hooks/use-settings";
import { pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Holding } from "@shared/schema";
import { strategyMix } from "../lib/strategy-mix";
import { strategyTint } from "../lib/strategy-tint";

/** One line under the portfolio total: each strategy's share of USD value, heaviest first. */
export function StrategyMixBar({ holdings }: { holdings: Holding[] }) {
  const { data: settings } = useSettings();
  const mix = useMemo(() => strategyMix(holdings, settings?.strategies), [holdings, settings]);

  return (
    <div className="-mt-4 mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground sm:gap-x-3">
      <span>{holdings.length} holdings</span>
      {mix.map((slice) => (
        <span key={slice.label} className="flex items-center gap-1.5 sm:gap-2">
          {/* Dividers only once the row fits on one line — when it wraps they'd strand a pipe at each line start. */}
          <span aria-hidden className="hidden text-border sm:inline">|</span>
          <span className={cn("text-[11px] font-medium uppercase tracking-[0.14em]", strategyTint(slice.colorIndex).text)}>
            {slice.label}
          </span>
          <span className="tabular-nums text-foreground">{pct(slice.share)}</span>
        </span>
      ))}
    </div>
  );
}
