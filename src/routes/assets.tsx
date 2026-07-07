import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "@/routes/__root";
import { PageHeader } from "@/components/page-header";

export const assetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/assets",
  component: AssetsPage,
});

function AssetsPage() {
  return <PageHeader eyebrow="ASSETS" title="What you own" />;
}
