import { motion } from "motion/react";
import { Banknote, Building2, CreditCard, Landmark, PiggyBank, TrendingUp } from "lucide-react";
import type { Totals } from "@shared/schema";
import { sgd } from "@/lib/format";

const CARDS = [
  { key: "portfolioSgd", label: "Portfolio", icon: TrendingUp, liability: false, chip: "bg-chart-1/12 text-chart-1" },
  { key: "savingsSgd", label: "Savings", icon: PiggyBank, liability: false, chip: "bg-chart-2/12 text-chart-2" },
  { key: "cpfSgd", label: "CPF", icon: Landmark, liability: false, chip: "bg-chart-3/12 text-chart-3" },
  { key: "propertySgd", label: "Property", icon: Building2, liability: false, chip: "bg-chart-4/12 text-chart-4" },
  { key: "creditCardsSgd", label: "Credit Cards", icon: CreditCard, liability: true, chip: "bg-chart-5/15 text-negative" },
  { key: "loansSgd", label: "Loans", icon: Banknote, liability: true, chip: "bg-chart-6/15 text-negative" },
] as const;

export function SummaryCards({ totals, fxRate }: { totals: Totals; fxRate?: number }) {
  return (
    <motion.div
      initial="hidden" animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
    >
      {CARDS.map((c) => {
        const value = c.liability ? -totals[c.key] : totals[c.key];
        const Icon = c.icon;
        return (
          <motion.div
            key={c.key}
            variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
            className="surface rounded-2xl p-4"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                {c.label}
              </span>
              <span className={`flex size-9 items-center justify-center rounded-full ${c.chip}`}>
                <Icon className="size-4" />
              </span>
            </div>
            <div className="text-xl font-semibold tracking-tight text-cream md:text-2xl">
              {sgd(value)}
            </div>
            {c.key === "portfolioSgd" && fxRate != null && (
              <div className="mt-1 text-xs text-muted-foreground">
                USD {totals.portfolioUsd.toLocaleString("en-US")} @ {fxRate.toFixed(4)}
              </div>
            )}
          </motion.div>
        );
      })}
    </motion.div>
  );
}
