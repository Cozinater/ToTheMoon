import { cn } from "@/lib/utils";
import { SERIES, type SeriesKey } from "../lib/chart-series";

// Chips carry the colour key and the toggle. Hidden chips keep their slot so the
// row never reflows as you click through it.
export function ChartLegend({
  hidden,
  onToggle,
}: {
  hidden: SeriesKey[];
  onToggle: (key: SeriesKey) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Chart categories"
      className="mt-3 flex flex-wrap gap-x-1 gap-y-1 text-xs text-muted-foreground"
    >
      {SERIES.map((s) => {
        const visible = !hidden.includes(s.key);
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onToggle(s.key)}
            aria-pressed={visible}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors outline-none",
              "hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
              !visible && "text-muted-foreground/50 line-through",
            )}
          >
            <span
              className="size-2 rounded-full border"
              style={{
                background: visible ? s.color : "transparent",
                borderColor: s.color,
              }}
            />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
