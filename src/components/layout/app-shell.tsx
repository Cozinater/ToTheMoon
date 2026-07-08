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

function BrandMark({ size = "size-10" }: { size?: string }) {
  return (
    <div
      className={`flex ${size} items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary shadow-[0_0_24px_rgba(232,192,105,0.25)]`}
    >
      <Rocket className="size-5" />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh">
      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col gap-10 border-r border-border/60 bg-sidebar p-6 md:flex">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div>
            <div className="font-display text-lg font-semibold tracking-tight">ToTheMoon</div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Build wealth. Go further.
            </div>
          </div>
        </div>
        <nav className="flex flex-col gap-1.5">
          {items.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
              activeProps={{
                className:
                  "!border-primary/40 bg-primary/10 !text-primary shadow-[0_0_24px_rgba(232,192,105,0.16),inset_0_0_16px_rgba(232,192,105,0.05)]",
              }}
              activeOptions={{ exact: to === "/" }}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <header className="flex items-center justify-between px-4 py-3 md:hidden">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandMark size="size-9" />
          <span className="font-display text-lg font-semibold tracking-tight">ToTheMoon</span>
        </Link>
        <Link
          to="/settings"
          aria-label="Settings"
          className="p-2 text-muted-foreground transition-colors hover:text-foreground"
          activeProps={{ className: "!text-primary" }}
        >
          <Settings className="size-5" />
        </Link>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border/60 bg-sidebar/90 backdrop-blur md:hidden">
        {items
          .filter(({ to }) => to !== "/settings")
          .map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-muted-foreground"
              activeProps={{ className: "!text-primary" }}
              activeOptions={{ exact: to === "/" }}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          ))}
      </nav>

      <main className="md:pl-72">
        <div className="mx-auto max-w-7xl p-4 pb-28 md:p-10 md:pb-12">{children}</div>
      </main>
    </div>
  );
}
