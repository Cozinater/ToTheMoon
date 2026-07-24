import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { AssetType } from "@shared/schema";
import type { SearchResponse, SearchResult } from "../types";

const TYPE_LABEL: Record<AssetType, string> = { stock: "Stock", etf: "ETF", crypto: "Crypto" };
const MANUAL_TYPES: AssetType[] = ["stock", "etf", "crypto"];

type Row =
  | { kind: "result"; result: SearchResult; disabled: boolean }
  | { kind: "manual"; type: AssetType };

const rowEnabled = (row: Row) => row.kind !== "result" || !row.disabled;

export function InstrumentCombobox(props: {
  selected: SearchResult | null;
  onSelect: (r: SearchResult | null) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const { onOpenChange } = props;
  const listId = useId();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const seq = useRef(0);

  const q = query.trim();
  const eligible = !props.selected && q.length >= 1;

  useEffect(() => {
    if (!eligible) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      let next: Row[];
      try {
        const { results } = await api<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`);
        next = results.length > 0
          ? results.map((r) => ({ kind: "result" as const, result: r, disabled: r.currency !== "USD" }))
          : MANUAL_TYPES.map((type) => ({ kind: "manual" as const, type }));
      } catch {
        next = MANUAL_TYPES.map((type) => ({ kind: "manual" as const, type }));
      }
      if (seq.current !== id) return; // stale response
      setRows(next);
      setActive(Math.max(0, next.findIndex(rowEnabled)));
      setOpen(true);
      onOpenChange?.(true);
    }, 300);
    return () => clearTimeout(t);
  }, [q, eligible, onOpenChange]);

  function choose(row: Row) {
    if (!rowEnabled(row)) return;
    props.onSelect(row.kind === "result"
      ? row.result
      : { symbol: q.toUpperCase(), name: "Manual entry", type: row.type, currency: "USD" });
    setOpen(false);
    onOpenChange?.(false);
    setRows([]);
  }

  function move(delta: number) {
    if (!open || rows.length === 0) return;
    let i = active;
    do { i = (i + delta + rows.length) % rows.length; } while (!rowEnabled(rows[i]!) && i !== active);
    setActive(i);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter" && open && rows[active]) { e.preventDefault(); choose(rows[active]!); }
    else if (e.key === "Escape" && open) { setOpen(false); onOpenChange?.(false); }
  }

  const showList = open && eligible && rows.length > 0;

  return (
    <div className="grid gap-1.5">
      <div className="relative">
        <Input
          id="instrument" role="combobox" aria-expanded={showList} aria-controls={listId}
          autoCapitalize="characters" autoComplete="off" placeholder="Search ticker or name…"
          value={props.selected ? props.selected.symbol : query}
          onChange={(e) => { props.onSelect(null); setQuery(e.target.value); }}
          onKeyDown={onKeyDown}
          onBlur={() => { setOpen(false); onOpenChange?.(false); }}
          className={props.selected ? "pr-16" : undefined}
        />
        {props.selected && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-primary">
            {TYPE_LABEL[props.selected.type]}
          </span>
        )}
      </div>
      {props.selected && props.selected.name !== "Manual entry" && (
        <p className="text-xs text-muted-foreground">
          {props.selected.name}{props.selected.exchange ? ` · ${props.selected.exchange}` : ""}
        </p>
      )}
      {showList && (
        <ul id={listId} role="listbox" className="max-h-56 overflow-y-auto rounded-xl border border-border bg-popover py-1">
          {rows.map((row, i) => {
            const key = row.kind === "result"
              ? `${row.result.symbol}-${row.result.type}-${row.result.exchange ?? ""}` : `manual-${row.type}`;
            return (
              <li
                key={key} role="option" aria-selected={i === active} aria-disabled={!rowEnabled(row)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(row)}
                onMouseEnter={() => rowEnabled(row) && setActive(i)}
                className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-sm ${
                  !rowEnabled(row) ? "cursor-not-allowed opacity-45"
                  : i === active ? "bg-primary/10 text-primary" : ""}`}
              >
                {row.kind === "result" ? (
                  <>
                    <span className="truncate">
                      <span className="font-semibold">{row.result.symbol}</span>
                      <span className="text-muted-foreground"> — {row.result.name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {TYPE_LABEL[row.result.type]}
                      {row.result.exchange ? ` · ${row.result.exchange}` : ""}
                      {row.result.currency !== "USD" ? " · USD listings only" : ""}
                    </span>
                  </>
                ) : (
                  <span>
                    Use &quot;{q.toUpperCase()}&quot; as{" "}
                    <span className="font-semibold">{TYPE_LABEL[row.type]}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
