import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "@/routes/__root";

// The home route ("/"). Replace this placeholder with a real feature page.
export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

function HomePage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-2">
      <h1 className="text-4xl font-bold tracking-tight">ToTheMoon</h1>
      <p className="text-muted-foreground">Your app shell is ready.</p>
    </main>
  );
}
