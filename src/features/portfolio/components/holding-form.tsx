import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveModal } from "@/components/responsive-modal";
import { api, ApiError } from "@/lib/api";
import { dateLabel, usd } from "@/lib/format";
import { round2 } from "@shared/totals";
import type { AssetType, Holding } from "@shared/schema";
import type { FxResponse, Quote } from "../types";

type QuoteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; quote: Quote; fxRate?: number }
  | { status: "error"; message: string };

export function HoldingForm(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Holding;
  onSave: (holding: Holding, fxRate?: number) => void;
}) {
  const [ticker, setTicker] = useState("");
  const [type, setType] = useState<AssetType>("stock");
  const [quantityStr, setQuantityStr] = useState("");
  const [asOf, setAsOf] = useState("");
  const [quote, setQuote] = useState<QuoteState>({ status: "idle" });

  useEffect(() => {
    if (!props.open) return;
    setTicker(props.initial?.ticker ?? "");
    setType(props.initial?.type ?? "stock");
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

  async function fetchQuote() {
    const symbol = ticker.trim();
    if (!symbol || quote.status === "loading") return;
    setQuote({ status: "loading" });
    try {
      const [q, fx] = await Promise.all([
        api<Quote>(`/api/quote?symbol=${encodeURIComponent(symbol)}&type=${type}`),
        api<FxResponse>("/api/fx"),
      ]);
      setQuote({ status: "ok", quote: q, fxRate: fx.rate });
    } catch (err) {
      setQuote({
        status: "error",
        message: err instanceof ApiError ? err.message : "Couldn't fetch the price — try again",
      });
    }
  }

  const quantity = Number(quantityStr);
  const canSave = quote.status === "ok" && asOf !== "" && Number.isFinite(quantity) && quantity > 0;

  function save() {
    if (quote.status !== "ok" || !canSave) return;
    props.onSave(
      {
        id: props.initial?.id ?? crypto.randomUUID(),
        ticker: quote.quote.symbol,
        type,
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
      title={props.initial ? `Edit ${props.initial.ticker}` : "Add holding"}
      description="Prices are fetched end-of-day in USD."
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ticker">Ticker</Label>
            <Input
              id="ticker" autoCapitalize="characters" placeholder="VOO"
              value={ticker}
              onChange={(e) => { setTicker(e.target.value.toUpperCase()); setQuote({ status: "idle" }); }}
              onBlur={fetchQuote}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => { setType(v as AssetType); setQuote({ status: "idle" }); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="stock">Stock</SelectItem>
                <SelectItem value="etf">ETF</SelectItem>
                <SelectItem value="crypto">Crypto</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
            <Input id="asOf" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-sm">
          {quote.status === "idle" && <span className="text-muted-foreground">Enter a ticker to fetch its end-of-day price.</span>}
          {quote.status === "loading" && <Skeleton className="h-5 w-40" />}
          {quote.status === "ok" && (
            <span>
              {usd(quote.quote.priceUsd)}
              <span className="text-muted-foreground">
                {" · EOD "}{dateLabel(quote.quote.asOf)}
                {quote.fxRate !== undefined ? ` · USD/SGD ${quote.fxRate}` : ""}
              </span>
            </span>
          )}
          {quote.status === "error" && <span className="text-destructive">{quote.message}</span>}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>Cancel</Button>
          {(quote.status === "error" || quote.status === "idle" || quote.status === "ok") ? (
            <Button variant="outline" onClick={fetchQuote} disabled={!ticker.trim()}>Fetch price</Button>
          ) : null}
          <Button onClick={save} disabled={!canSave}>Save holding</Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
