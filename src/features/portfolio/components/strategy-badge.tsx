import { cn } from "@/lib/utils";
import { strategyTint } from "../lib/strategy-tint";

// Outlined, not filled: the border carries the colour so rows stay quiet.
export function StrategyBadge({ value, colorIndex }: { value: string; colorIndex: number }) {
  const tint = strategyTint(colorIndex);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border bg-transparent px-3.5 py-1.5 text-xs font-medium",
        tint.border,
        tint.text,
      )}
    >
      {value}
    </span>
  );
}
