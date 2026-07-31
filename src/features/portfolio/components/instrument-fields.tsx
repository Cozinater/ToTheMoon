import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useSettings } from "@/hooks/use-settings";
import { api, ApiError } from "@/lib/api";
import { qty, usd } from "@/lib/format";
import { round2 } from "@shared/totals";
import type { Holding, QuotableType } from "@shared/schema";
import type { InstrumentHolding } from "../lib/cash";
import { InstrumentCombobox } from "./instrument-combobox";
import type { FxResponse, Quote, SearchResult } from "../types";

type QuoteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; quote: Quote; fxRate?: number }
  | { status: "error"; message: string };

const fromHolding = (h: InstrumentHolding): SearchResult =>
  ({ symbol: h.ticker, name: h.ticker, type: h.type, currency: "USD" });

/** Add/edit a priced holding: search an instrument, fetch its USD quote, pick a strategy. */
export function InstrumentFields(props: {
  open: boolean;
  initial?: InstrumentHolding;
  onListOpenChange: (open: boolean) => void;
  onSave: (holding: Holding, fxRate?: number) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [quantityStr, setQuantityStr] = useState("");
  const [asOf, setAsOf] = useState("");
  const [quote, setQuote] = useState<QuoteState>({ status: "idle" });
  const { data: settings } = useSettings();
  const [strategy, setStrategy] = useState("");
  const initialisedRef = useRef(false);

  useEffect(() => {
    if (!props.open) return;
    setSelected(props.initial ? fromHolding(props.initial) : null);
    setQuantityStr(props.initial ? String(props.initial.quantity) : "");
    setAsOf(props.initial?.asOf ?? "");
    setStrategy(props.initial?.strategy ?? "");
    initialisedRef.current = Boolean(props.initial?.strategy);
    if (props.initial) {
      setQuote({
        status: "ok",
        quote: {
          symbol: props.initial.ticker,
          type: props.initial.type,
          priceUsd: props.initial.priceUsd,
          asOf: props.initial.asOf,
        },
        fxRate: undefined,
      });
    } else {
      setQuote({ status: "idle" });
    }
  }, [props.open, props.initial]);

  useEffect(() => {
    if (!props.open || initialisedRef.current || !settings) return;
    const def = settings.strategies.includes("Long Term") ? "Long Term" : settings.strategies[0] ?? "";
    if (def) { setStrategy(def); initialisedRef.current = true; }
  }, [props.open, settings]);

  async function fetchQuote(symbol: string, type: QuotableType) {
    setQuote({ status: "loading" });
    try {
      const [q, fx] = await Promise.all([
        api<Quote>(`/api/quote?symbol=${encodeURIComponent(symbol)}&type=${type}`),
        api<FxResponse>("/api/fx"),
      ]);
      setQuote({ status: "ok", quote: q, fxRate: fx.rate });
      setAsOf(q.asOf); // keep the holding's as-of consistent with the fetched price's date
    } catch (err) {
      setQuote({
        status: "error",
        message: err instanceof ApiError ? err.message : "Couldn't fetch the price — try again",
      });
    }
  }

  function handleSelect(r: SearchResult | null) {
    setSelected(r);
    if (r) void fetchQuote(r.symbol, r.type);
    else setQuote({ status: "idle" });
  }

  const quantity = Number(quantityStr);
  const canSave =
    selected !== null && quote.status === "ok" && quote.quote.symbol === selected.symbol &&
    asOf !== "" && Number.isFinite(quantity) && quantity > 0;

  const strategyOptions = useMemo(() => {
    const base = settings?.strategies ?? [];
    return strategy && !base.includes(strategy) ? [...base, strategy] : base;
  }, [settings, strategy]);

  function save() {
    if (!selected || quote.status !== "ok" || !canSave) return;
    props.onSave(
      {
        id: props.initial?.id ?? crypto.randomUUID(),
        ticker: quote.quote.symbol,
        type: selected.type,
        quantity,
        priceUsd: quote.quote.priceUsd,
        valueUsd: round2(quantity * quote.quote.priceUsd),
        asOf,
        strategy: strategy || undefined,
      },
      quote.fxRate,
    );
    props.onClose();
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="instrument">Instrument</Label>
        <InstrumentCombobox selected={selected} onSelect={handleSelect} onOpenChange={props.onListOpenChange} />
      </div>

      {/* Qty only ever holds a few digits, so it gets a fixed narrow column. Below the
          ResponsiveModal breakpoint the drawer is too narrow for three fields abreast. */}
      <div className="grid grid-cols-[4.5rem_1fr] gap-3 sm:grid-cols-[4.5rem_1fr_1fr]">
        <div className="grid gap-1.5">
          <Label htmlFor="quantity">Qty</Label>
          <Input
            id="quantity" type="number" inputMode="decimal" min="0" step="any" placeholder="0"
            className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            value={quantityStr} onChange={(e) => setQuantityStr(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="asOf">As-of date</Label>
          <DatePicker id="asOf" value={asOf} onChange={setAsOf} />
        </div>
        <div className="col-span-2 grid gap-1.5 sm:col-span-1">
          <Label htmlFor="strategy">Strategy</Label>
          <Select value={strategy} onValueChange={setStrategy}>
            <SelectTrigger
              id="strategy"
              className="h-10 w-full min-w-0 gap-2 rounded-xl border-border bg-background/50 px-3 py-1 text-base focus-visible:ring-ring/40 data-[size=default]:h-10 md:text-sm dark:bg-background/50 dark:hover:bg-background/50"
            >
              <SelectValue placeholder="Select a strategy" />
            </SelectTrigger>
            {/* Anchored below the trigger, like the DatePicker's calendar popover — the
                item-aligned default floats the list over the Instrument field. */}
            <SelectContent
              position="popper" align="start" sideOffset={6}
              className="surface w-(--radix-select-trigger-width) rounded-xl p-1 shadow-lg ring-0"
            >
              {strategyOptions.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-sm">
        {quote.status === "idle" && <span className="text-muted-foreground">Search for an instrument to fetch its latest price.</span>}
        {quote.status === "loading" && <Skeleton className="h-5 w-40" />}
        {quote.status === "ok" && (
          Number.isFinite(quantity) && quantity > 0 ? (
            <span>
              {usd(quote.quote.priceUsd)}
              <span className="text-muted-foreground">{" × "}{qty(quantity)}{" = "}</span>
              <span className="font-medium">{usd(round2(quantity * quote.quote.priceUsd))}</span>
            </span>
          ) : (
            <span>{usd(quote.quote.priceUsd)}</span>
          )
        )}
        {quote.status === "error" && <span className="text-negative">{quote.message}</span>}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={props.onClose}>Cancel</Button>
        <Button onClick={save} disabled={!canSave}>Save holding</Button>
      </div>
    </div>
  );
}
