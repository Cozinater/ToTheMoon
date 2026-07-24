import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveModal } from "@/components/responsive-modal";
import { api, ApiError } from "@/lib/api";
import { qty, usd } from "@/lib/format";
import { round2 } from "@shared/totals";
import type { AssetType, Holding } from "@shared/schema";
import { InstrumentCombobox } from "./instrument-combobox";
import type { FxResponse, Quote, SearchResult } from "../types";

type QuoteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; quote: Quote; fxRate?: number }
  | { status: "error"; message: string };

const fromHolding = (h: Holding): SearchResult =>
  ({ symbol: h.ticker, name: h.ticker, type: h.type, currency: "USD" });

export function HoldingForm(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Holding;
  onSave: (holding: Holding, fxRate?: number) => void;
}) {
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [quantityStr, setQuantityStr] = useState("");
  const [asOf, setAsOf] = useState("");
  const [quote, setQuote] = useState<QuoteState>({ status: "idle" });
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    setSelected(props.initial ? fromHolding(props.initial) : null);
    setQuantityStr(props.initial ? String(props.initial.quantity) : "");
    setAsOf(props.initial?.asOf ?? "");
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

  async function fetchQuote(symbol: string, type: AssetType) {
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
      },
      quote.fxRate,
    );
    props.onOpenChange(false);
  }

  return (
    <ResponsiveModal
      open={props.open}
      onOpenChange={props.onOpenChange}
      onEscapeKeyDown={(e) => { if (listOpen) e.preventDefault(); }}
      title={props.initial ? `Edit ${props.initial.ticker}` : "Add holding"}
      description="Pick an instrument and we'll fetch its latest USD price."
    >
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="instrument">Instrument</Label>
          <InstrumentCombobox selected={selected} onSelect={handleSelect} onOpenChange={setListOpen} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity" type="number" inputMode="decimal" min="0" step="any" placeholder="25"
              value={quantityStr} onChange={(e) => setQuantityStr(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="asOf">As-of date</Label>
            <DatePicker id="asOf" value={asOf} onChange={setAsOf} />
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
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!canSave}>Save holding</Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
