import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveModal } from "@/components/responsive-modal";
import { useAmendSnapshot } from "@/hooks/use-snapshots";
import { monthLabel } from "@/lib/format";
import type { AmendInput, Entry, Holding, Snapshot } from "@shared/schema";
import { HoldingForm } from "@/features/portfolio/components/holding-form";
import { HoldingsTable } from "@/features/portfolio/components/holdings-table";
import { EntryForm } from "@/features/assets/components/entry-form";
import { SectionCard } from "@/features/assets/components/section-card";
import {
  ASSET_SECTIONS, LIABILITY_SECTIONS,
  type AssetSectionKey, type LiabilitySectionKey,
} from "@/features/assets/sections";

type Target =
  | { group: "assets"; key: AssetSectionKey; title: string; entry?: Entry }
  | { group: "liabilities"; key: LiabilitySectionKey; title: string; entry?: Entry };

const toInput = (s: Snapshot): AmendInput => ({
  snapshotDate: s.snapshotDate, fxRate: s.fxRate,
  holdings: s.holdings, assets: s.assets, liabilities: s.liabilities,
});

export function AmendDialog(props: { snapshot: Snapshot; open: boolean; onOpenChange: (o: boolean) => void }) {
  const amend = useAmendSnapshot(props.snapshot.month);
  const [doc, setDoc] = useState<AmendInput>(() => toInput(props.snapshot));
  const [fxStr, setFxStr] = useState(String(props.snapshot.fxRate));
  const [holdingForm, setHoldingForm] = useState<{ open: boolean; editing?: Holding }>({ open: false });
  const [entryForm, setEntryForm] = useState<Target | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setDoc(toInput(props.snapshot));
    setFxStr(String(props.snapshot.fxRate));
    amend.reset();
  }, [props.open, props.snapshot]); // eslint-disable-line react-hooks/exhaustive-deps

  const fxRate = Number(fxStr);
  const canSave = doc.snapshotDate !== "" && Number.isFinite(fxRate) && fxRate > 0 && !amend.isPending;

  function upsertHolding(h: Holding) {
    setDoc((d) => ({
      ...d,
      holdings: d.holdings.some((x) => x.id === h.id)
        ? d.holdings.map((x) => (x.id === h.id ? h : x))
        : [...d.holdings, h],
    }));
  }

  function setList(t: Target, next: Entry[]) {
    setDoc((d) =>
      t.group === "assets"
        ? { ...d, assets: { ...d.assets, [t.key]: next } }
        : { ...d, liabilities: { ...d.liabilities, [t.key]: next } });
  }
  const listOf = (t: Target) => (t.group === "assets" ? doc.assets[t.key] : doc.liabilities[t.key]);

  function upsertEntry(e: Entry) {
    if (!entryForm) return;
    const list = listOf(entryForm);
    setList(entryForm, list.some((x) => x.id === e.id) ? list.map((x) => (x.id === e.id ? e : x)) : [...list, e]);
  }

  return (
    <ResponsiveModal open={props.open} onOpenChange={props.onOpenChange} wide
      title={`Amend ${monthLabel(props.snapshot.month)}`}
      description="Totals are recalculated when you save. The original close date is preserved.">
      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="amend-date">Snapshot date</Label>
            <Input id="amend-date" type="date" value={doc.snapshotDate}
              onChange={(e) => setDoc((d) => ({ ...d, snapshotDate: e.target.value }))} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="amend-fx">USD/SGD rate</Label>
            <Input id="amend-fx" type="number" inputMode="decimal" min="0" step="any"
              value={fxStr} onChange={(e) => setFxStr(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Holdings</h3>
            <Button variant="ghost" size="sm" onClick={() => setHoldingForm({ open: true })}>
              <Plus className="size-4" /> Add
            </Button>
          </div>
          <HoldingsTable holdings={doc.holdings}
            onEdit={(h) => setHoldingForm({ open: true, editing: h })}
            onDelete={(h) => setDoc((d) => ({ ...d, holdings: d.holdings.filter((x) => x.id !== h.id) }))} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {ASSET_SECTIONS.map((s) => (
            <SectionCard key={s.key} title={s.title} icon={s.icon} limit={s.limit} tone="asset"
              entries={doc.assets[s.key]}
              onAdd={() => setEntryForm({ group: "assets", key: s.key, title: s.title })}
              onEdit={(e) => setEntryForm({ group: "assets", key: s.key, title: s.title, entry: e })}
              onDelete={(e) => setList({ group: "assets", key: s.key, title: s.title },
                doc.assets[s.key].filter((x) => x.id !== e.id))} />
          ))}
          {LIABILITY_SECTIONS.map((s) => (
            <SectionCard key={s.key} title={s.title} icon={s.icon} limit={s.limit} tone="liability"
              entries={doc.liabilities[s.key]}
              onAdd={() => setEntryForm({ group: "liabilities", key: s.key, title: s.title })}
              onEdit={(e) => setEntryForm({ group: "liabilities", key: s.key, title: s.title, entry: e })}
              onDelete={(e) => setList({ group: "liabilities", key: s.key, title: s.title },
                doc.liabilities[s.key].filter((x) => x.id !== e.id))} />
          ))}
        </div>

        {amend.isError && <p className="text-sm text-destructive">{amend.error.message}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>Cancel</Button>
          <Button disabled={!canSave}
            onClick={() => amend.mutate({ ...doc, fxRate }, { onSuccess: () => props.onOpenChange(false) })}>
            {amend.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      <HoldingForm open={holdingForm.open}
        onOpenChange={(o) => setHoldingForm((f) => ({ ...f, open: o }))}
        initial={holdingForm.editing}
        onSave={(h) => upsertHolding(h)} />
      <EntryForm open={!!entryForm} onOpenChange={(o) => !o && setEntryForm(null)}
        initial={entryForm?.entry} sectionTitle={entryForm?.title ?? ""} onSave={upsertEntry} />
    </ResponsiveModal>
  );
}
