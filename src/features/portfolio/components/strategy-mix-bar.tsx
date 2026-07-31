import { useMemo } from "react";
import { useSettings } from "@/hooks/use-settings";
import { pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Holding } from "@shared/schema";
import { splitCash } from "../lib/cash";
import { strategyMix } from "../lib/strategy-mix";
import { strategyTint } from "../lib/strategy-tint";

const LABEL_CLASS = "text-[11px] font-medium uppercase tracking-[0.14em]";

/**
 * One line under the portfolio total: each strategy's share of INVESTED USD value,
 * heaviest first, then cash as a separate dry-powder chip measured against the whole
 * portfolio.
 *
 * The two denominators differ on purpose — "of my invested money 41% is Long Term,
 * and 17.9% of the portfolio is dry powder" — so the chips are not meant to sum to
 * 100% across the divider, and the count reads "N invested" rather than "N holdings"
 * to keep it honest about which side of the split it counts.
 *
 * The cash chip is kept off the strategy palette (never a text-chart-* token) but is
 * brighter than the muted "Unassigned" tint, which is the chip it would otherwise be
 * confused with — those two sit side by side and are measured against different
 * denominators. Its leading divider is a drawn rule rather than a glyph, and unlike
 * the slice dividers it renders at every width: on a narrow screen it is the only
 * thing separating the two.
 */
export function StrategyMixBar({ holdings }: { holdings: Holding[] }) {
  const { data: settings } = useSettings();
  const mix = useMemo(() => strategyMix(holdings, settings?.strategies), [holdings, settings]);
  const { invested, investedUsd, cashUsd } = useMemo(() => splitCash(holdings), [holdings]);
  const totalUsd = investedUsd + cashUsd;

  return (
    <div className="-mt-4 mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground sm:gap-x-3">
      <span>{invested.length} invested</span>
      {mix.map((slice) => (
        <span key={slice.label} className="flex items-center gap-1.5 sm:gap-2">
          {/* Dividers only once the row fits on one line — when it wraps they'd strand a pipe at each line start. */}
          <span aria-hidden className="hidden text-border sm:inline">|</span>
          <span className={cn(LABEL_CLASS, strategyTint(slice.colorIndex).text)}>{slice.label}</span>
          <span className="tabular-nums text-foreground">{pct(slice.share)}</span>
        </span>
      ))}
      {cashUsd > 0 && totalUsd > 0 && (
        <span className="flex items-center gap-1.5 sm:gap-2">
          {/* A drawn rule, not a glyph, and shown at every width: cash is outside the
              strategy set, and on mobile this is the only thing keeping it apart from
              an equally muted "Unassigned" chip measured on a different denominator. */}
          <span aria-hidden className="mx-1 inline-block h-3 w-px shrink-0 bg-border" />
          <span className={cn(LABEL_CLASS, "text-foreground/70")}>Cash</span>
          <span className="tabular-nums text-foreground">{pct(cashUsd / totalUsd)}</span>
        </span>
      )}
    </div>
  );
}
