import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compactSgd, dateLabel, sgd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { IncomeRow } from "../lib/income-stats";

type Point = IncomeRow & { t: number };

const GOLD = "#e8c069";
const SURFACE = "#132420";
const AXIS_INK = "#9db2a4";

/** 1 January of every year the rows cross, so the time axis reads in whole years. */
function yearTicks(points: Point[]): number[] {
  const firstYear = new Date(points[0].t).getUTCFullYear();
  const lastYear = new Date(points[points.length - 1].t).getUTCFullYear();
  const ticks: number[] = [];
  for (let y = firstYear + 1; y <= lastYear; y++) ticks.push(Date.UTC(y, 0, 1));
  return ticks.length > 0 ? ticks : [points[0].t, points[points.length - 1].t];
}

function ChartTooltip(props: { active?: boolean; payload?: { payload?: Point }[] }) {
  const point = props.payload?.[0]?.payload;
  if (!props.active || !point) return null;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 font-medium">{dateLabel(point.date)}</div>
      <div className="flex justify-between gap-6">
        <span className="text-muted-foreground">Income</span>
        <span className="tabular-nums">{sgd(point.amountSgd)}</span>
      </div>
      {point.changePct !== null && (
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Change</span>
          <span className={cn("tabular-nums", point.changePct >= 0 ? "text-positive" : "text-negative")}>
            {point.changePct >= 0 ? "+" : ""}{(point.changePct * 100).toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}

export function IncomeChart({ rows }: { rows: IncomeRow[] }) {
  const points: Point[] = rows.map((r) => ({ ...r, t: Date.parse(`${r.date}T00:00:00Z`) }));

  return (
    <div className="surface rounded-3xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">Income over time</h2>
        <span className="text-xs text-muted-foreground">
          {rows.length} {rows.length === 1 ? "row" : "rows"}
        </span>
      </div>
      <div className="h-72 md:h-96">
        {points.length < 2 ? (
          <div role="status" className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Add at least two rows to draw the line
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 12, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid stroke="rgb(244 236 220 / 0.07)" strokeDasharray="4 6" vertical={false} />
              <XAxis
                dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]}
                ticks={yearTicks(points)}
                tickFormatter={(t: number) => String(new Date(t).getUTCFullYear())}
                tickLine={false} axisLine={false} tick={{ fill: AXIS_INK, fontSize: 12 }}
              />
              <YAxis
                tickFormatter={compactSgd} tickLine={false} axisLine={false} width={72}
                domain={[(min: number) => Math.floor((min * 0.9) / 1000) * 1000, "auto"]}
                tick={{ fill: AXIS_INK, fontSize: 12 }}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: AXIS_INK, strokeOpacity: 0.4 }} />
              <Line
                type="linear" dataKey="amountSgd" name="Income" stroke={GOLD} strokeWidth={2}
                dot={{ r: 4, fill: GOLD, stroke: SURFACE, strokeWidth: 2 }}
                activeDot={{ r: 6, fill: GOLD, stroke: SURFACE, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
