import { motion } from "motion/react";
import type { ReactNode } from "react";

export function PageHeader(props: { eyebrow: string; title: string; action?: ReactNode }) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mb-6 flex flex-wrap items-end justify-between gap-4"
    >
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">{props.eyebrow}</div>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-cream md:text-5xl">{props.title}</h1>
      </div>
      {props.action}
    </motion.header>
  );
}
