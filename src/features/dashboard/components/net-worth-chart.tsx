import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compactSgd, sgd } from "@/lib/format";
import type { ChartPoint } from "../hooks/use-dashboard-data";

const SERIES = [
  { key: "portfolio", label: "Portfolio", color: "#e8c468", stack: "pos" },
  { key: "savings", label: "Savings", color: "#6fcf97", stack: "pos" },
  { key: "cpf", label: "CPF", color: "#f2efe3", stack: "pos" },
  { key: "property", label: "Property", color: "#4fbdba", stack: "pos" },
  { key: "creditCards", label: "Credit Cards", color: "#e37878", stack: "neg" },
  { key: "loans", label: "Loans", color: "#d9648c", stack: "neg" },
] as const;

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

export function NetWorthChart({ points }: { points: ChartPoint[] }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-medium">Net worth over time</h2>
        <span className="text-xs text-muted-foreground">{points.length} points</span>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <defs>
              {SERIES.map((s) => (
                <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="#223028" strokeDasharray="4 6" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#9aa89e", fontSize: 12 }} />
            <YAxis tickFormatter={compactSgd} tickLine={false} axisLine={false} width={72} tick={{ fill: "#9aa89e", fontSize: 12 }} />
            <Tooltip content={<ChartTooltip />} />
            {SERIES.map((s) => (
              <Area key={s.key} type="monotone" dataKey={s.key} stackId={s.stack} name={s.label}
                stroke={s.color} strokeWidth={1.5} fill={`url(#fill-${s.key})`} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
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
