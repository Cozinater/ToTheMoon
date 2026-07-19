import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MonthPicker } from "@/components/month-picker";
import { compactSgd, sgd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ChartPoint } from "../hooks/use-dashboard-data";
import { filterChartPoints, type ChartRange, type ChartRangePreset } from "../lib/chart-range";

const SERIES = [
  { key: "portfolio", label: "Portfolio", color: "var(--chart-1)", stack: "pos" },
  { key: "savings", label: "Savings", color: "var(--chart-2)", stack: "pos" },
  { key: "cpf", label: "CPF", color: "var(--chart-3)", stack: "pos" },
  { key: "property", label: "Property", color: "var(--chart-4)", stack: "pos" },
  { key: "creditCards", label: "Credit Cards", color: "var(--chart-5)", stack: "neg" },
  { key: "loans", label: "Loans", color: "var(--chart-6)", stack: "neg" },
] as const;

const PRESETS: { preset: ChartRangePreset; label: string }[] = [
  { preset: "6m", label: "6M" },
  { preset: "1y", label: "1Y" },
  { preset: "ytd", label: "YTD" },
  { preset: "all", label: "All" },
];

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

type TooltipEntry = { name?: string; value?: number; color?: string; payload?: ChartPoint };

function ChartTooltip(props: { active?: boolean; label?: string; payload?: TooltipEntry[] }) {
  if (!props.active || !props.payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 font-medium">{props.label}</div>
      {props.payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-6">
          <span style={{ color: p.color }}>{p.name}</span>
          <span>{sgd(p.value ?? 0)}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between gap-6 border-t border-border pt-1 font-medium">
        <span>Net worth</span>
        <span>{sgd(props.payload[0]?.payload?.netWorth ?? 0)}</span>
      </div>
    </div>
  );
}

function RangePills({ range, onChange }: { range: ChartRange; onChange: (r: ChartRange) => void }) {
  const pill = (active: boolean) =>
    cn(
      "rounded-lg px-2 py-1 text-xs font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
      active
        ? "bg-secondary text-secondary-foreground"
        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
    );
  return (
    <div className="flex items-center gap-1">
      {PRESETS.map((p) => (
        <button key={p.preset} type="button" onClick={() => onChange({ preset: p.preset })}
          aria-pressed={"preset" in range && range.preset === p.preset}
          className={pill("preset" in range && range.preset === p.preset)}>
          {p.label}
        </button>
      ))}
      <button type="button" onClick={() => { if ("preset" in range) onChange({}); }}
        aria-pressed={!("preset" in range)} className={pill(!("preset" in range))}>
        Custom
      </button>
    </div>
  );
}

function CustomRangeInputs(props: {
  range: { start?: string; end?: string };
  onChange: (r: ChartRange) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <label className="flex items-center gap-2">
        From
        <MonthPicker
          className="h-8 w-40"
          value={props.range.start ?? ""}
          onChange={(v) => props.onChange({ ...props.range, start: v || undefined })}
        />
      </label>
      <label className="flex items-center gap-2">
        To
        <MonthPicker
          className="h-8 w-40"
          value={props.range.end ?? ""}
          onChange={(v) => props.onChange({ ...props.range, end: v || undefined })}
        />
      </label>
    </div>
  );
}

export function NetWorthChart({ points }: { points: ChartPoint[] }) {
  const [range, setRange] = useState<ChartRange>({ preset: "all" });
  const filtered = filterChartPoints(points, range, currentMonth());
  const snapshotCount = filtered.filter((p) => p.month !== null).length;

  return (
    <div className="surface rounded-3xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">Net worth over time</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {snapshotCount} {snapshotCount === 1 ? "snapshot" : "snapshots"}
          </span>
          <RangePills range={range} onChange={setRange} />
        </div>
      </div>
      {!("preset" in range) && <CustomRangeInputs range={range} onChange={setRange} />}
      <div className="h-80 md:h-96">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No snapshots in this range
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filtered} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <defs>
                {SERIES.map((s) => (
                  <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0.06} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke="rgb(244 236 220 / 0.07)" strokeDasharray="4 6" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#9db2a4", fontSize: 12 }} />
              <YAxis tickFormatter={compactSgd} tickLine={false} axisLine={false} width={72} tick={{ fill: "#9db2a4", fontSize: 12 }} />
              <Tooltip content={<ChartTooltip />} />
              {SERIES.map((s) => (
                <Area key={s.key} type="monotone" dataKey={s.key} stackId={s.stack} name={s.label}
                  stroke={s.color} strokeWidth={2} fill={`url(#fill-${s.key})`} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
