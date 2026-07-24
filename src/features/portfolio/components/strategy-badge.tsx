import { cn } from "@/lib/utils";

// Six chart tokens (see App.css @theme), cycled by the strategy's index in the Settings list.
const CHART_TINTS = [
  "bg-chart-1/15 text-chart-1",
  "bg-chart-2/15 text-chart-2",
  "bg-chart-3/15 text-chart-3",
  "bg-chart-4/15 text-chart-4",
  "bg-chart-5/15 text-chart-5",
  "bg-chart-6/15 text-chart-6",
];
const NEUTRAL = "border border-border/60 bg-secondary/50 text-muted-foreground";

export function StrategyBadge({ value, colorIndex }: { value: string; colorIndex: number }) {
  const tint = colorIndex >= 0 ? CHART_TINTS[colorIndex % CHART_TINTS.length] : NEUTRAL;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tint)}>
      {value}
    </span>
  );
}
