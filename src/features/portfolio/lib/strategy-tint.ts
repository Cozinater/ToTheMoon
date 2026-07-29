// Six chart tokens (see App.css @theme), cycled by the strategy's index in the Settings list,
// so a strategy keeps the same colour wherever it appears — table badge or portfolio mix.
const CHART_TINTS = [
  { text: "text-chart-1", border: "border-chart-1/50" },
  { text: "text-chart-2", border: "border-chart-2/50" },
  { text: "text-chart-3", border: "border-chart-3/50" },
  { text: "text-chart-4", border: "border-chart-4/50" },
  { text: "text-chart-5", border: "border-chart-5/50" },
  { text: "text-chart-6", border: "border-chart-6/50" },
];
const NEUTRAL = { text: "text-muted-foreground", border: "border-border/60" };

/** Tailwind classes for a strategy's colour; colorIndex < 0 (unknown/unassigned) stays neutral. */
export function strategyTint(colorIndex: number) {
  return colorIndex >= 0 ? CHART_TINTS[colorIndex % CHART_TINTS.length] : NEUTRAL;
}
