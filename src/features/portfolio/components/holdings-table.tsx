import { useMemo, useState } from "react";
import {
  createColumnHelper, flexRender, getCoreRowModel, getFilteredRowModel,
  getSortedRowModel, useReactTable,
  type ColumnFiltersState, type SortingState,
} from "@tanstack/react-table";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpDown, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AssetType, Holding } from "@shared/schema";
import { pct, qty, usd } from "@/lib/format";

const TYPE_TABS: { value: "all" | AssetType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "stock", label: "Stocks" },
  { value: "etf", label: "ETFs" },
  { value: "crypto", label: "Crypto" },
];

// Per-column cell classes (also hides Type/Price on mobile to avoid horizontal scroll)
const CELL_CLASS: Record<string, string> = {
  ticker: "px-5 py-4",
  type: "hidden px-5 py-4 sm:table-cell",
  quantity: "px-5 py-4 text-right",
  priceUsd: "hidden px-5 py-4 text-right sm:table-cell",
  valueUsd: "px-5 py-4 text-right",
  share: "px-5 py-4 text-right",
  actions: "w-24 px-3 py-4 text-right whitespace-nowrap",
};

export function HoldingsTable(props: {
  holdings: Holding[];
  onEdit?: (h: Holding) => void;
  onDelete?: (h: Holding) => void;
  filterable?: boolean;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "valueUsd", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const readOnly = !props.onEdit && !props.onDelete;
  const total = props.holdings.reduce((acc, h) => acc + h.valueUsd, 0);
  const { onEdit, onDelete } = props;

  const columns = useMemo(() => {
    const col = createColumnHelper<Holding>();
    return [
      col.accessor("ticker", {
        header: "Ticker",
        cell: (c) => <span className="font-semibold">{c.getValue()}</span>,
      }),
      col.accessor("type", {
        header: "Type",
        filterFn: "equals",
        cell: (c) => <span className="capitalize text-muted-foreground">{c.getValue()}</span>,
      }),
      col.accessor("quantity", { header: "Qty", cell: (c) => qty(c.getValue()) }),
      col.accessor("priceUsd", { header: "Price (USD)", cell: (c) => usd(c.getValue()) }),
      col.accessor("valueUsd", { header: "Value (USD)", cell: (c) => usd(c.getValue()) }),
      col.display({
        id: "share",
        header: "%",
        cell: (c) => (
          <span className="text-muted-foreground">
            {total > 0 ? pct(c.row.original.valueUsd / total) : "–"}
          </span>
        ),
      }),
      ...(readOnly
        ? []
        : [
            col.display({
              id: "actions",
              header: "",
              cell: (c) => (
                <>
                  {onEdit && (
                    <Button variant="ghost" size="icon" aria-label={`Edit ${c.row.original.ticker}`}
                      onClick={() => onEdit(c.row.original)}>
                      <Pencil className="size-4" />
                    </Button>
                  )}
                  {onDelete && (
                    <Button variant="ghost" size="icon" aria-label={`Delete ${c.row.original.ticker}`}
                      onClick={() => onDelete(c.row.original)}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </>
              ),
            }),
          ]),
    ];
  }, [total, readOnly, onEdit, onDelete]);

  const table = useReactTable({
    data: props.holdings,
    columns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, value) =>
      row.original.ticker.toUpperCase().includes(String(value).trim().toUpperCase()),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const activeType = (columnFilters.find((f) => f.id === "type")?.value as AssetType | undefined) ?? "all";
  const setType = (value: "all" | AssetType) =>
    setColumnFilters(value === "all" ? [] : [{ id: "type", value }]);
  const rows = table.getRowModel().rows;

  return (
    <div className="surface overflow-hidden rounded-3xl">
      {props.filterable && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-5 py-3">
          <div className="flex gap-1">
            {TYPE_TABS.map((t) => (
              <Button key={t.value} size="sm" variant={activeType === t.value ? "secondary" : "ghost"}
                onClick={() => setType(t.value)}>
                {t.label}
              </Button>
            ))}
          </div>
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Filter tickers…"
            className="h-8 w-40"
          />
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="text-left text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              {hg.headers.map((header) => (
                <th key={header.id} className={`${CELL_CLASS[header.column.id]} font-medium`}>
                  {header.column.getCanSort() ? (
                    <button
                      className="inline-flex items-center gap-1"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <ArrowUpDown className="size-3" />
                    </button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {rows.length === 0 && props.holdings.length > 0 && (
              <tr>
                <td colSpan={readOnly ? 6 : 7} className="px-4 py-6 text-center text-muted-foreground">
                  No holdings match.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <motion.tr
                key={row.original.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="border-t border-border/50"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={CELL_CLASS[cell.column.id]}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}
