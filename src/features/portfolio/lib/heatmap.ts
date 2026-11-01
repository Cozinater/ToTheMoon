import { periodChange, type Performance, type PerformancePeriod } from "@shared/performance";
import type { InstrumentHolding } from "./cash";
import { UNASSIGNED } from "./strategy-mix";
import type { Group } from "./treemap";

/** A move this large or larger gets the full red or green; smaller moves fade toward the neutral gray. */
export const HEAT_CLAMP = 0.3;

/**
 * Diverging fill: red for a loss, green for a gain, gray at zero. Red/green breaks the
 * usual colour-blind-safe pairing on purpose. It is the convention every market heatmap
 * uses, and every tile also prints its signed percentage, so colour is never the only cue.
 * Both ends keep the cream tile text at 4.5:1 or better; the gray is far above that.
 */
const LOSS = [0xb9, 0x3a, 0x32];
const GAIN = [0x1f, 0x7a, 0x46];
export const HEAT_NEUTRAL = "#3a3f3d";
const NEUTRAL = [0x3a, 0x3f, 0x3d];

const hex = (rgb: number[]) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

/**
 * The fill for a fractional change. Intensity follows the square root of the move, so a
 * 10% move already shows clearly (58% of full colour) instead of reading as gray, while
 * the order of moves is kept: a bigger move is always a stronger colour.
 */
export function heatColor(change: number | null): string {
  if (change === null || !Number.isFinite(change)) return HEAT_NEUTRAL;
  const t = Math.sqrt(Math.min(Math.abs(change) / HEAT_CLAMP, 1));
  const end = change < 0 ? LOSS : GAIN;
  return hex(NEUTRAL.map((n, i) => n + (end[i]! - n) * t));
}

export type HeatCell = {
  holding: InstrumentHolding;
  performance?: Performance;
  /** Fractional change over the chosen period; null while loading or without enough history. */
  change: number | null;
};

const perfKey = (symbol: string, type: string) => `${type}:${symbol.toUpperCase()}`;

/**
 * Groups invested holdings by strategy for the heatmap. Tile size is the position's USD
 * value, so the biggest holdings take the most room, the way market cap sizes a market map.
 */
export function heatmapGroups(
  holdings: InstrumentHolding[],
  performance: Performance[],
  period: PerformancePeriod,
): Group<HeatCell>[] {
  const byKey = new Map(performance.map((p) => [perfKey(p.symbol, p.type), p]));
  const groups = new Map<string, Group<HeatCell>>();
  for (const h of holdings) {
    const label = h.strategy ?? UNASSIGNED;
    const p = byKey.get(perfKey(h.ticker, h.type));
    const group = groups.get(label) ?? { label, items: [] };
    group.items.push({ value: h.valueUsd, data: { holding: h, performance: p, change: p ? periodChange(p, period) : null } });
    groups.set(label, group);
  }
  return [...groups.values()];
}

/** "+12.34%" / "−3.10%" with a true minus sign, or an em dash when there is no figure. */
export function signedPct(change: number | null): string {
  if (change === null) return "—";
  const v = (change * 100).toFixed(2);
  return change > 0 ? `+${v}%` : change < 0 ? `−${v.slice(1)}%` : `${v}%`;
}
