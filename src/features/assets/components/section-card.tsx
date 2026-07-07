import { AnimatePresence, motion } from "motion/react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import type { Entry } from "@shared/schema";
import { dateLabel, sgd } from "@/lib/format";

export function SectionCard(props: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  entries: Entry[];
  limit: number;
  tone: "asset" | "liability";
  onAdd?: () => void;
  onEdit?: (e: Entry) => void;
  onDelete?: (e: Entry) => void;
}) {
  const Icon = props.icon;
  const total = props.entries.reduce((acc, e) => acc + e.balanceSgd, 0);
  const atLimit = props.entries.length >= props.limit;
  const negative = props.tone === "liability";
  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="rounded-2xl border border-border/60 bg-card p-5"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={
              negative
                ? "flex size-10 items-center justify-center rounded-full bg-destructive/15 text-destructive"
                : "flex size-10 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300"
            }
          >
            <Icon className="size-5" />
          </div>
          <div>
            <div className="font-medium">{props.title}</div>
            <div className="text-xs text-muted-foreground">
              {negative && total > 0 ? "-" : ""}{sgd(total)} · {props.entries.length}/
              {Number.isFinite(props.limit) ? props.limit : "∞"}
            </div>
          </div>
        </div>
        {props.onAdd && (
          <Button variant="ghost" size="sm" onClick={props.onAdd} disabled={atLimit}
            title={atLimit ? "Max reached" : undefined}>
            <Plus className="size-4" /> Add
          </Button>
        )}
      </div>

      {props.entries.length === 0 ? (
        <p className="px-1 pb-1 text-sm text-muted-foreground">No entries yet — add your first.</p>
      ) : (
        <ul>
          <AnimatePresence initial={false}>
            {props.entries.map((e) => (
              <motion.li
                key={e.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, overflow: "hidden" }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="flex items-center justify-between gap-3 border-t border-border/40 py-3 first:border-t-0"
              >
                <div>
                  <div className="text-sm font-medium">{e.name}</div>
                  <div className="text-xs text-muted-foreground">as of {dateLabel(e.asOf)}</div>
                </div>
                <div className="flex items-center gap-1">
                  <span className={negative ? "text-sm text-destructive" : "text-sm"}>
                    {negative ? "-" : ""}{sgd(e.balanceSgd)}
                  </span>
                  {props.onEdit && (
                    <Button variant="ghost" size="icon" aria-label={`Edit ${e.name}`} onClick={() => props.onEdit!(e)}>
                      <Pencil className="size-4" />
                    </Button>
                  )}
                  {props.onDelete && (
                    <Button variant="ghost" size="icon" aria-label={`Delete ${e.name}`} onClick={() => props.onDelete!(e)}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </motion.section>
  );
}
