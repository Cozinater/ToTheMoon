import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { Draft } from "@shared/schema";

export function DraftCard({ draft }: { draft: Draft }) {
  const assetCount = draft.assets.bankSavings.length + draft.assets.cpf.length + draft.assets.property.length;
  const liabilityCount = draft.liabilities.creditCards.length + draft.liabilities.loans.length;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card p-5">
      <div>
        <h2 className="font-medium">Current draft snapshot</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {draft.holdings.length} holdings · {assetCount} assets · {liabilityCount} liabilities — keep editing,
          then close the month from Settings to lock it into your timeline.
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild><Link to="/portfolio">Update Portfolio</Link></Button>
        <Button asChild variant="outline"><Link to="/assets">Update Balances</Link></Button>
      </div>
    </div>
  );
}
