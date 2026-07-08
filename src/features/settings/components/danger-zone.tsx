import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useResetAll } from "@/hooks/use-snapshots";

export function DangerZone() {
  const reset = useResetAll();
  const [confirmText, setConfirmText] = useState("");
  const [done, setDone] = useState<string | null>(null);

  return (
    <section className="surface rounded-3xl p-6">
      <div className="mb-5 flex items-center gap-3.5">
        <div className="flex size-11 items-center justify-center rounded-full bg-chart-6/20 text-negative">
          <Trash2 className="size-5" />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">Danger zone</h2>
          <p className="text-sm text-muted-foreground">
            Permanently deletes every snapshot and the current draft.
          </p>
        </div>
      </div>
      <div className="grid max-w-sm gap-1.5">
        <Label htmlFor="reset-confirm">Type RESET to confirm</Label>
        <Input id="reset-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
      </div>
      {reset.isError && <p className="mt-3 text-sm text-negative">{reset.error.message}</p>}
      {done && <p className="mt-3 text-sm text-muted-foreground">{done}</p>}
      <Button
        variant="destructive" className="mt-4"
        disabled={confirmText !== "RESET" || reset.isPending}
        onClick={() =>
          reset.mutate(undefined, {
            onSuccess: (r) => { setDone(`Deleted ${r.deleted} items.`); setConfirmText(""); },
          })
        }
      >
        {reset.isPending ? "Resetting…" : "Reset all data"}
      </Button>
    </section>
  );
}
