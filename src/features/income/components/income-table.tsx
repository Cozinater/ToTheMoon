import { useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Plus, Trash2 } from "lucide-react";
import { INCOME_LIMIT, type IncomeEntry } from "@shared/schema";
import { DatePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toYmd } from "@/lib/date";
import { dateLabel, sgd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { withChanges } from "../lib/income-stats";

export function IncomeTable(props: {
  entries: IncomeEntry[];
  onSave: (entries: IncomeEntry[]) => void;
  saving: boolean;
  saveError: string | null;
}) {
  const [date, setDate] = useState(() => toYmd(new Date()));
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const rows = withChanges(props.entries).reverse(); // newest first
  const atLimit = props.entries.length >= INCOME_LIMIT;

  function add(e: FormEvent) {
    e.preventDefault();
    const amountSgd = Math.round(Number(amount) * 100) / 100;
    if (!date) return setFormError("Pick a date.");
    if (!(amountSgd > 0)) return setFormError("Enter an income above zero.");
    if (props.entries.some((r) => r.date === date)) {
      return setFormError(`There is already a row for ${dateLabel(date)}. Delete it first to replace it.`);
    }
    setFormError(null);
    props.onSave([...props.entries, { id: crypto.randomUUID(), date, amountSgd }]);
    setAmount("");
  }

  const remove = (id: string) => props.onSave(props.entries.filter((r) => r.id !== id));
  const error = formError ?? props.saveError;

  return (
    <section className="surface rounded-3xl p-6">
      <h2 className="mb-4 font-display text-lg font-semibold tracking-tight">Income history</h2>

      <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="income-date">Date</Label>
          <DatePicker id="income-date" value={date} onChange={setDate} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="income-amount">Income (SGD)</Label>
          <Input
            id="income-amount" type="number" inputMode="decimal" min="0.01" step="0.01"
            placeholder="e.g. 7640" value={amount} onChange={(e) => setAmount(e.target.value)}
            aria-invalid={formError !== null && !(Number(amount) > 0) ? true : undefined}
          />
        </div>
        <Button type="submit" className="h-10" disabled={props.saving || atLimit}
          title={atLimit ? `At most ${INCOME_LIMIT} rows` : undefined}>
          <Plus className="size-4" /> Add row
        </Button>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-negative">{error}</p>}

      {rows.length === 0 ? (
        <p className="mt-6 px-1 text-sm text-muted-foreground">No rows yet. Add your first income above.</p>
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              <th className="pb-2 font-medium">Date</th>
              <th className="pb-2 text-right font-medium">Income</th>
              <th className="pb-2 text-right font-medium">Change</th>
              <th className="w-10 pb-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {rows.map((r) => (
                <motion.tr
                  key={r.id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="border-t border-border/50"
                >
                  <td className="py-3">{dateLabel(r.date)}</td>
                  <td className="py-3 text-right font-medium tabular-nums text-cream">{sgd(r.amountSgd)}</td>
                  <td className={cn("py-3 text-right tabular-nums",
                    r.changePct === null ? "text-muted-foreground"
                      : r.changePct >= 0 ? "text-positive" : "text-negative")}>
                    {r.changePct === null ? "—" : `${r.changePct >= 0 ? "+" : ""}${(r.changePct * 100).toFixed(1)}%`}
                  </td>
                  <td className="py-1 text-right">
                    <Button variant="ghost" size="icon" className="text-muted-foreground"
                      aria-label={`Delete income on ${dateLabel(r.date)}`}
                      disabled={props.saving} onClick={() => remove(r.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      )}
    </section>
  );
}
