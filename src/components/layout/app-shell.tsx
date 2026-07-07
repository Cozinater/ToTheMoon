import { Link } from "@tanstack/react-router";
import { ChartPie, Clock, LayoutGrid, Rocket, Settings, Wallet } from "lucide-react";
import type { ReactNode } from "react";

const items = [
  { to: "/", label: "Dashboard", icon: LayoutGrid },
  { to: "/portfolio", label: "Portfolio", icon: ChartPie },
  { to: "/assets", label: "Assets", icon: Wallet },
  { to: "/history", label: "History", icon: Clock },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col gap-8 border-r border-border/60 p-6 md:flex">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary">
            <Rocket className="size-5" />
          </div>
          <div>
            <div className="font-semibold tracking-tight">ToTheMoon</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Build wealth. Go further.
            </div>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {items.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "border border-primary/30 bg-primary/10 !text-primary" }}
              activeOptions={{ exact: to === "/" }}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border/60 bg-background/85 backdrop-blur md:hidden">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex flex-col items-center gap-1 py-2.5 text-[10px] text-muted-foreground"
            activeProps={{ className: "!text-primary" }}
            activeOptions={{ exact: to === "/" }}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </nav>

      <main className="md:pl-60">
        <div className="mx-auto max-w-6xl p-4 pb-24 md:p-10 md:pb-12">{children}</div>
      </main>
    </div>
  );
}
