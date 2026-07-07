import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "@/routes/__root";
import { PageHeader } from "@/components/page-header";

export const portfolioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portfolio",
  component: PortfolioPage,
});

function PortfolioPage() {
  return <PageHeader eyebrow="PORTFOLIO (USD)" title="Portfolio" />;
}
