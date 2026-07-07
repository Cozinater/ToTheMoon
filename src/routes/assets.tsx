import { useState } from "react";
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "@/routes/__root";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDraft, useSaveDraft } from "@/hooks/use-draft";
import type { Entry } from "@shared/schema";
import { EntryForm } from "@/features/assets/components/entry-form";
import { SectionCard } from "@/features/assets/components/section-card";
import {
  ASSET_SECTIONS, LIABILITY_SECTIONS,
  type AssetSectionKey, type LiabilitySectionKey,
} from "@/features/assets/sections";

export const assetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/assets",
  component: AssetsPage,
});

type Target =
  | { group: "assets"; key: AssetSectionKey; title: string; entry?: Entry }
  | { group: "liabilities"; key: LiabilitySectionKey; title: string; entry?: Entry };

function AssetsPage() {
  const { data: draft, isPending, isError, refetch } = useDraft();
  const save = useSaveDraft();
  const [form, setForm] = useState<Target | null>(null);
  const [deleting, setDeleting] = useState<Target | null>(null);

  if (isPending) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-14 w-64" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}
      </div>
    );
  }
  if (isError || !draft) return <ErrorState message="Couldn't load your balances." onRetry={() => refetch()} />;

  function entriesOf(t: Target): Entry[] {
    return t.group === "assets" ? draft!.assets[t.key] : draft!.liabilities[t.key];
  }

  function saveList(t: Target, next: Entry[]) {
    save.mutate(
      t.group === "assets"
        ? { ...draft!, assets: { ...draft!.assets, [t.key]: next } }
        : { ...draft!, liabilities: { ...draft!.liabilities, [t.key]: next } },
    );
  }

  function upsertEntry(entry: Entry) {
    if (!form) return;
    const list = entriesOf(form);
    const exists = list.some((e) => e.id === entry.id);
    saveList(form, exists ? list.map((e) => (e.id === entry.id ? entry : e)) : [...list, entry]);
  }

  return (
    <>
      <PageHeader eyebrow="ASSETS" title="What you own" />
      <div className="grid gap-4">
        {ASSET_SECTIONS.map((s) => (
          <SectionCard
            key={s.key} title={s.title} icon={s.icon} limit={s.limit} tone="asset"
            entries={draft.assets[s.key]}
            onAdd={() => setForm({ group: "assets", key: s.key, title: s.title })}
            onEdit={(e) => setForm({ group: "assets", key: s.key, title: s.title, entry: e })}
            onDelete={(e) => setDeleting({ group: "assets", key: s.key, title: s.title, entry: e })}
          />
        ))}
      </div>

      <Separator className="my-10" />

      <PageHeader eyebrow="LIABILITIES" title="What you owe" />
      <div className="grid gap-4">
        {LIABILITY_SECTIONS.map((s) => (
          <SectionCard
            key={s.key} title={s.title} icon={s.icon} limit={s.limit} tone="liability"
            entries={draft.liabilities[s.key]}
            onAdd={() => setForm({ group: "liabilities", key: s.key, title: s.title })}
            onEdit={(e) => setForm({ group: "liabilities", key: s.key, title: s.title, entry: e })}
            onDelete={(e) => setDeleting({ group: "liabilities", key: s.key, title: s.title, entry: e })}
          />
        ))}
      </div>

      <EntryForm
        open={!!form}
        onOpenChange={(o) => !o && setForm(null)}
        initial={form?.entry}
        sectionTitle={form?.title ?? ""}
        onSave={upsertEntry}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.entry?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it from the current draft only — closed months are untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting?.entry) {
                  saveList(deleting, entriesOf(deleting).filter((e) => e.id !== deleting.entry!.id));
                }
                setDeleting(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
