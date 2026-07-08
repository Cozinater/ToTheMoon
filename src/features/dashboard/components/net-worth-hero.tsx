import { animate, motion, useReducedMotion } from "motion/react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { pct, sgd } from "@/lib/format";

function CountUp({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);
  const prev = useRef(0);
  useEffect(() => {
    if (reduced) { setDisplay(value); return; }
    const controls = animate(prev.current, value, { duration: 0.9, ease: "easeOut", onUpdate: setDisplay });
    prev.current = value;
    return () => controls.stop();
  }, [value, reduced]);
  return <>{sgd(display)}</>;
}

export function NetWorthHero(props: {
  value: number;
  delta: { amount: number; fraction: number | null; vs: string } | null;
}) {
  const up = (props.delta?.amount ?? 0) >= 0;
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}>
      <div className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Total Net Worth</div>
      <div className="glow mt-3 font-serif text-7xl tracking-tight text-cream md:text-8xl">
        <CountUp value={props.value} />
      </div>
      {props.delta && (
        <div className="mt-4 flex items-center gap-2 text-sm">
          {up
            ? <ArrowUpRight className="size-4 text-positive" />
            : <ArrowDownRight className="size-4 text-negative" />}
          {props.delta.fraction != null && (
            <span className={up ? "font-medium text-positive" : "font-medium text-negative"}>
              {up ? "+" : ""}{pct(props.delta.fraction)}
            </span>
          )}
          <span className="text-muted-foreground">{sgd(Math.abs(props.delta.amount))} vs {props.delta.vs}</span>
        </div>
      )}
    </motion.div>
  );
}
