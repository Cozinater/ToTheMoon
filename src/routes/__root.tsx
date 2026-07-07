import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { MotionConfig } from "motion/react";
import { AppShell } from "@/components/layout/app-shell";

export const rootRoute = createRootRoute({ component: RootLayout });

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const bare = pathname === "/login"; // login renders without nav chrome
  return (
    <MotionConfig reducedMotion="user">
      {bare ? (
        <Outlet />
      ) : (
        <AppShell>
          <Outlet />
        </AppShell>
      )}
      <TanStackRouterDevtools />
    </MotionConfig>
  );
}
