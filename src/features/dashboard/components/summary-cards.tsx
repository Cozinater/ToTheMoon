import { motion } from "motion/react";
import { Banknote, Building2, CreditCard, Landmark, PiggyBank, TrendingUp } from "lucide-react";
import type { Totals } from "@shared/schema";
import { sgd } from "@/lib/format";

const CARDS = [
  { key: "portfolioSgd", label: "Portfolio", icon: TrendingUp, liability: false },
  { key: "savingsSgd", label: "Savings", icon: PiggyBank, liability: false },
  { key: "cpfSgd", label: "CPF", icon: Landmark, liability: false },
  { key: "propertySgd", label: "Property", icon: Building2, liability: false },
  { key: "creditCardsSgd", label: "Credit Cards", icon: CreditCard, liability: true },
  { key: "loansSgd", label: "Loans", icon: Banknote, liability: true },
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
            className="rounded-2xl border border-border/60 bg-card p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{c.label}</span>
              <Icon className={c.liability ? "size-4 text-destructive" : "size-4 text-emerald-300"} />
            </div>
            <div className={value < 0 ? "text-lg font-semibold text-destructive" : "text-lg font-semibold"}>
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
