import { motion } from "motion/react";
import type { ComponentType, ReactNode } from "react";

export function EmptyState(props: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  action?: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/80 px-6 py-14 text-center"
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-6" />
      </div>
      <div className="text-lg font-medium">{props.title}</div>
      <p className="max-w-sm text-sm text-muted-foreground">{props.hint}</p>
      {props.action}
    </motion.div>
  );
}
