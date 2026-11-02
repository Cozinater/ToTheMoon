import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { PerformancePeriod } from "@shared/performance";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";
import { dateLabel, usd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePerformance } from "../hooks/use-performance";
import type { InstrumentHolding } from "../lib/cash";
import { HEAT_CLAMP, heatColor, heatmapGroups, signedPct, type HeatCell } from "../lib/heatmap";
import { groupedTreemap, HEADER_H, type Tile } from "../lib/treemap";

const PERIODS: { period: PerformancePeriod; label: string; title: string }[] = [
  { period: "ytd", label: "YTD", title: "Year to date" },
  { period: "yoy", label: "YoY", title: "Year on year" },
];

/** Space between neighbouring tiles; the frame colour shows through it. */
const GAP = 2;
const TOOLTIP_W = 232;
const TOOLTIP_H = 110; // approximate, only used to decide when to flip above the pointer

function PeriodPills({ period, onChange }: { period: PerformancePeriod; onChange: (p: PerformancePeriod) => void }) {
  return (
    <div role="group" aria-label="Performance period" className="flex items-center gap-1">
      {PERIODS.map((p) => (
        <button key={p.period} type="button" title={p.title} aria-pressed={period === p.period}
          onClick={() => onChange(p.period)}
          className={cn(
            "rounded-lg px-2 py-1 text-xs font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            period === p.period
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
          )}>
          {p.label}
        </button>
      ))}
    </div>
  );
}

function HeatTile({ tile, period, onHover }: {
  tile: Tile<HeatCell>;
  period: PerformancePeriod;
  onHover: (cell: HeatCell | null) => void;
}) {
  const { holding, change } = tile.data;
  const w = tile.w - GAP;
  const h = tile.h - GAP;
  const ticker = holding.ticker.toUpperCase();
  // Scale the ticker to the tile, capped so one huge holding doesn't shout.
  const size = Math.max(10, Math.min(32, (w - 10) / (ticker.length * 0.8), h * 0.3));
  const showTicker = w >= 26 && h >= 16;
  const showChange = h >= size * 2.1 + 4 && w >= 46;
  const periodLabel = PERIODS.find((p) => p.period === period)!.label;

  return (
    <div
      role="img"
      aria-label={`${ticker} ${signedPct(change)} ${periodLabel}, ${usd(holding.valueUsd)}`}
      onPointerEnter={() => onHover(tile.data)}
      onPointerLeave={() => onHover(null)}
      className="absolute flex flex-col items-center justify-center overflow-hidden rounded-[3px] text-center leading-none text-cream transition-[background-color] duration-300"
      style={{ left: tile.x + GAP / 2, top: tile.y + GAP / 2, width: w, height: h, backgroundColor: heatColor(change) }}
    >
      {showTicker && (
        <span className="font-display font-bold tracking-tight" style={{ fontSize: size }}>{ticker}</span>
      )}
      {showChange && (
        <span className="mt-1 font-semibold tabular-nums" style={{ fontSize: Math.max(10, size * 0.5) }}>
          {signedPct(change)}
        </span>
      )}
    </div>
  );
}

function HeatTooltip({ cell, period, pending, x, y, width, height }: {
  cell: HeatCell; period: PerformancePeriod; pending: boolean; x: number; y: number; width: number; height: number;
}) {
  const { holding, performance, change } = cell;
  const base = performance?.[period];
  // Sit below-right of the pointer, flipping left / above near the map's far edges.
  const left = x + 16 + TOOLTIP_W > width ? Math.max(0, x - 16 - TOOLTIP_W) : x + 16;
  const position = y + 16 + TOOLTIP_H > height ? { bottom: height - y + 16 } : { top: y + 16 };
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-xl"
      style={{ left, ...position, width: TOOLTIP_W }}
    >
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="font-display text-sm font-semibold">{holding.ticker.toUpperCase()}</span>
        <span className="tabular-nums font-semibold">{signedPct(change)}</span>
      </div>
      <div className="text-muted-foreground">{holding.strategy ?? "Unassigned"} · {usd(holding.valueUsd)}</div>
      {performance && base ? (
        <div className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-t border-border pt-1.5">
          <span className="text-muted-foreground">{dateLabel(base.date)}</span>
          <span className="text-right tabular-nums">{usd(base.close)}</span>
          <span className="text-muted-foreground">{dateLabel(performance.last.date)}</span>
          <span className="text-right tabular-nums">{usd(performance.last.close)}</span>
        </div>
      ) : (
        <div className="mt-1.5 border-t border-border pt-1.5 text-muted-foreground">
          {pending ? "Loading price history…" : performance ? "Not enough history for this period" : "No price history available"}
        </div>
      )}
    </div>
  );
}

/** Gradient stops sampled from `heatColor`, so the legend follows its square-root curve exactly. */
const LEGEND_GRADIENT = `linear-gradient(to right, ${
  Array.from({ length: 21 }, (_, i) => heatColor(-HEAT_CLAMP + (i / 10) * HEAT_CLAMP)).join(", ")
})`;

function HeatLegend() {
  const stops = [-HEAT_CLAMP, -HEAT_CLAMP / 2, 0, HEAT_CLAMP / 2, HEAT_CLAMP];
  return (
    <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
      <div className="flex items-start gap-2">
        <span className="leading-2">Loss</span>
        <div className="w-48 sm:w-64">
          <div className="h-2 rounded-full" style={{ background: LEGEND_GRADIENT }} />
          <div className="mt-1 flex justify-between tabular-nums">
            {stops.map((s) => <span key={s}>{s === 0 ? "0%" : `${s > 0 ? "+" : "−"}${Math.abs(s * 100)}%`}</span>)}
          </div>
        </div>
        <span className="leading-2">Gain</span>
      </div>
      <span className="leading-2">Tile size is position value.</span>
    </div>
  );
}

/**
 * A market-map view of the invested holdings: one tile per position, sized by its USD value,
 * grouped by strategy, and coloured by how far its price has moved since the start of the
 * year (YTD) or since the same day last year (YoY).
 */
export function PerformanceHeatmap({ holdings }: { holdings: InstrumentHolding[] }) {
  const [period, setPeriod] = useState<PerformancePeriod>("ytd");
  const [hovered, setHovered] = useState<HeatCell | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [width, setWidth] = useState(0);
  const mapRef = useRef<HTMLDivElement>(null);
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const height = isDesktop ? 440 : 340;
  const { data, isPending, isError, refetch, isFetching } = usePerformance(holdings);

  useLayoutEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const performance = useMemo(() => data?.performance ?? [], [data]);
  const groups = useMemo(
    () => groupedTreemap(heatmapGroups(holdings, performance, period), { x: 0, y: 0, w: width, h: height }),
    [holdings, performance, period, width, height],
  );

  const rateLimited = data?.rateLimited ?? [];
  const failed = data?.failed ?? [];
  // The baseline date most holdings share (it differs only for thin or new listings).
  const dateCounts = new Map<string, number>();
  for (const p of performance) {
    const d = p[period]?.date;
    if (d) dateCounts.set(d, (dateCounts.get(d) ?? 0) + 1);
  }
  const commonBase = [...dateCounts].sort((a, b) => b[1] - a[1])[0]?.[0];

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPointer({ x: e.clientX - r.left, y: e.clientY - r.top });
  };

  return (
    <section className="surface mb-6 rounded-3xl p-4 sm:p-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">Performance heatmap</h2>
        <PeriodPills period={period} onChange={setPeriod} />
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        {isPending ? "Loading price history…"
          : isError ? (
            <>Couldn't load price history.{" "}
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => refetch()} disabled={isFetching}>
                Try again
              </Button>
            </>
          )
          : commonBase ? `Price change since the ${dateLabel(commonBase)} close`
          : "No price history yet"}
        {rateLimited.length > 0 && ` · ${rateLimited.length} more loading — price limit hit, retrying in a minute`}
        {failed.length > 0 && ` · No history for ${failed.join(", ")}`}
      </p>

      <div ref={mapRef} onPointerMove={onPointerMove} onPointerLeave={() => setHovered(null)}
        className="relative w-full overflow-hidden rounded-xl bg-sidebar" style={{ height }}>
        {groups.map((g) => (
          <div key={g.label}>
            {g.showHeader && (
              <div
                className="absolute truncate px-1.5 text-[11px] font-semibold uppercase leading-none tracking-[0.12em] text-cream/85"
                style={{ left: g.x + GAP / 2, top: g.y, width: g.w - GAP, height: HEADER_H, lineHeight: `${HEADER_H}px` }}
              >
                {g.label}
              </div>
            )}
            {g.tiles.map((t) => (
              <HeatTile key={t.data.holding.id} tile={t} period={period} onHover={setHovered} />
            ))}
            {/* A thicker rule between groups, so strategy boundaries read at a glance. */}
            <div className="pointer-events-none absolute border-2 border-sidebar"
              style={{ left: g.x - 1, top: g.y - 1, width: g.w + 2, height: g.h + 2 }} />
          </div>
        ))}
        {hovered && (
          <HeatTooltip cell={hovered} period={period}
            pending={isPending || rateLimited.includes(hovered.holding.ticker.toUpperCase())}
            x={pointer.x} y={pointer.y} width={width} height={height} />
        )}
      </div>
      <HeatLegend />
    </section>
  );
}
