import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "@/routes/__root";
import { PageHeader } from "@/components/page-header";
import { CloseMonthCard } from "@/features/settings/components/close-month-card";
import { DangerZone } from "@/features/settings/components/danger-zone";

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <>
      <PageHeader eyebrow="SETTINGS" title="Configuration" />
      <div className="grid gap-6">
        <CloseMonthCard />
        <DangerZone />
      </div>
    </>
  );
}
