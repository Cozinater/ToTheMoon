import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { MotionConfig } from "motion/react";
import { AppShell } from "@/components/layout/app-shell";

export const rootRoute = createRootRoute({ component: RootLayout });

function RootLayout() {
  return (
    <MotionConfig reducedMotion="user">
      <AppShell>
        <Outlet />
        <TanStackRouterDevtools />
      </AppShell>
    </MotionConfig>
  );
}
