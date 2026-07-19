import { useState } from "react";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { currentYm, formatDisplayMonth, parseYm, toYm } from "@/lib/date";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function MonthPicker(props: {
  id?: string;
  value: string; // "yyyy-mm" or ""
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => parseYm(props.value)?.year ?? new Date().getFullYear());
  const nowYm = currentYm();

  // Each time the popover opens, start the navigator on the selected year (or this year).
  const onOpenChange = (next: boolean) => {
    if (next) setViewYear(parseYm(props.value)?.year ?? new Date().getFullYear());
    setOpen(next);
  };

  const commit = (value: string) => {
    props.onChange(value);
    setOpen(false);
  };

  const navBtn =
    "flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-secondary/60 focus-visible:ring-3 focus-visible:ring-ring/40";

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        id={props.id}
        className={cn(
          "flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-border bg-background/50 px-3 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/30 md:text-sm",
          props.className,
        )}
      >
        {parseYm(props.value) ? (
          <span>{formatDisplayMonth(props.value)}</span>
        ) : (
          <span className="text-muted-foreground">{props.placeholder ?? "Pick a month"}</span>
        )}
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="surface w-auto rounded-2xl p-2 shadow-lg ring-0">
        <div className="flex items-center justify-between px-1 pb-2">
          <button type="button" aria-label="Previous year" onClick={() => setViewYear((y) => y - 1)} className={navBtn}>
            <ChevronLeftIcon className="size-4" />
          </button>
          <span className="font-display text-sm font-semibold select-none">{viewYear}</span>
          <button type="button" aria-label="Next year" onClick={() => setViewYear((y) => y + 1)} className={navBtn}>
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MONTHS.map((label, i) => {
            const ym = toYm(viewYear, i + 1);
            const isSelected = ym === props.value;
            const isCurrent = ym === nowYm;
            return (
              <button
                key={label}
                type="button"
                aria-pressed={isSelected}
                onClick={() => commit(ym)}
                className={cn(
                  "relative rounded-lg px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                  isSelected
                    ? "bg-primary font-semibold text-primary-foreground shadow-[0_0_20px_rgba(232,192,105,0.18)]"
                    : "hover:bg-secondary/60",
                  !isSelected && isCurrent && "text-primary",
                )}
              >
                {label}
                {isCurrent && !isSelected && (
                  <span className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex items-center justify-between px-1 pt-1">
          <button
            type="button"
            onClick={() => commit("")}
            className="rounded text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => commit(nowYm)}
            className="rounded text-xs font-medium text-primary transition-colors outline-none hover:text-primary/80 focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            This month
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
