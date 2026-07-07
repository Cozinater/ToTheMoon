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
        <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{props.eyebrow}</div>
        <h1 className="font-display text-4xl text-foreground md:text-5xl">{props.title}</h1>
      </div>
      {props.action}
    </motion.header>
  );
}
