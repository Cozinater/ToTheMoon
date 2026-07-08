import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { Draft } from "@shared/schema";

export function DraftCard({ draft }: { draft: Draft }) {
  const assetCount = draft.assets.bankSavings.length + draft.assets.cpf.length + draft.assets.property.length;
  const liabilityCount = draft.liabilities.creditCards.length + draft.liabilities.loans.length;
  return (
    <div className="surface flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
      <div className="max-w-xl">
        <h2 className="font-display text-lg font-semibold tracking-tight">Current draft snapshot</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {draft.holdings.length} holdings · {assetCount} assets · {liabilityCount} liabilities — keep editing,
          then close the month from{" "}
          <Link to="/settings" className="font-medium text-primary hover:underline">Settings</Link>{" "}
          to lock it into your timeline.
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild><Link to="/portfolio">Update Portfolio</Link></Button>
        <Button asChild variant="secondary"><Link to="/assets">Update Balances</Link></Button>
      </div>
    </div>
  );
}
