import { createRouter } from "@tanstack/react-router";
import { rootRoute } from "@/routes/__root";
import { indexRoute } from "@/routes/index";
import { portfolioRoute } from "@/routes/portfolio";
import { assetsRoute } from "@/routes/assets";
import { historyRoute } from "@/routes/history";
import { settingsRoute } from "@/routes/settings";

// Code-based route tree. Add new routes by creating them under src/routes/
// and registering them as children here.
//
// To switch to file-based routing later, install @tanstack/router-plugin,
// add it to vite.config.ts, and let it generate the route tree instead.
const routeTree = rootRoute.addChildren([
  indexRoute, portfolioRoute, assetsRoute, historyRoute, settingsRoute,
]);

export const router = createRouter({ routeTree });

// Makes router-aware hooks/components fully type-safe across the app.
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
