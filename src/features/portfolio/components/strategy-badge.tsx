import { cn } from "@/lib/utils";

// Six chart tokens (see App.css @theme), cycled by the strategy's index in the Settings list.
// Outlined, not filled: the border carries the colour so rows stay quiet.
const CHART_TINTS = [
  "border-chart-1/50 text-chart-1",
  "border-chart-2/50 text-chart-2",
  "border-chart-3/50 text-chart-3",
  "border-chart-4/50 text-chart-4",
  "border-chart-5/50 text-chart-5",
  "border-chart-6/50 text-chart-6",
];
const NEUTRAL = "border-border/60 text-muted-foreground";

export function StrategyBadge({ value, colorIndex }: { value: string; colorIndex: number }) {
  const tint = colorIndex >= 0 ? CHART_TINTS[colorIndex % CHART_TINTS.length] : NEUTRAL;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border bg-transparent px-3.5 py-1.5 text-xs font-medium",
        tint,
      )}
    >
      {value}
    </span>
  );
}
