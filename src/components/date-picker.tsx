import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMediaQuery } from "@/hooks/use-media-query";
import { formatDisplayDate, parseYmd, toYmd } from "@/lib/date";

// The year list runs from 1990 to five years ahead: wide enough for old loans and
// salaries, short enough to scroll.
const FIRST_MONTH = new Date(1990, 0, 1);
const lastMonth = () => new Date(new Date().getFullYear() + 5, 11, 1);

export function DatePicker(props: {
  id?: string;
  value: string; // "yyyy-mm-dd" or ""
  onChange: (value: string) => void;
}) {
  // Same breakpoint as ResponsiveModal: mobile keeps the native platform picker.
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const [open, setOpen] = useState(false);

  if (!isDesktop) {
    return <Input id={props.id} type="date" value={props.value} onChange={(e) => props.onChange(e.target.value)} />;
  }

  const selected = parseYmd(props.value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={props.id}
        className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-border bg-background/50 px-3 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/30 md:text-sm"
      >
        {selected ? (
          <span>{formatDisplayDate(props.value)}</span>
        ) : (
          <span className="text-muted-foreground">Pick a date</span>
        )}
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="surface w-auto rounded-2xl p-2 shadow-lg ring-0">
        <Calendar
          mode="single"
          weekStartsOn={1}
          selected={selected}
          defaultMonth={selected ?? new Date()}
          captionLayout="dropdown"
          startMonth={FIRST_MONTH}
          endMonth={lastMonth()}
          onSelect={(date) => {
            if (date) props.onChange(toYmd(date));
            setOpen(false);
          }}
          className="[--cell-size:--spacing(9)]"
          classNames={{
            // Each label sits under an invisible native <select>; clicking it opens the list.
            caption_label:
              "flex h-8 items-center gap-1 rounded-lg px-2 font-display text-sm font-semibold select-none transition-colors group-hover/dropdown:bg-secondary/60 [&>svg]:size-3.5 [&>svg]:text-muted-foreground",
            dropdown_root:
              "group/dropdown relative rounded-lg has-focus-visible:ring-3 has-focus-visible:ring-ring/40",
            dropdown: "absolute inset-0 w-full cursor-pointer appearance-none bg-popover opacity-0",
            weekday: "flex-1 select-none text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground",
            today:
              "relative rounded-(--cell-radius) text-primary after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary data-[selected=true]:after:hidden",
            outside: "text-muted-foreground/40 aria-selected:text-muted-foreground/40",
            day_button:
              "data-[selected-single=true]:font-semibold data-[selected-single=true]:shadow-[0_0_20px_rgba(232,192,105,0.18)]",
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
