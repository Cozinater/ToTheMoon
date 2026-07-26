import { useEffect, useState } from "react";
import { Plus, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSaveSettings, useSettings } from "@/hooks/use-settings";

type Row = { id: string; value: string };

export function StrategiesCard() {
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();
  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (settings) setRows(settings.strategies.map((value) => ({ id: crypto.randomUUID(), value })));
  }, [settings]);

  const setValue = (id: string, value: string) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, value } : r)));
  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));
  const addRow = () => setRows((prev) => [...prev, { id: crypto.randomUUID(), value: "" }]);

  function save() {
    setNote(null);
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const { value } of rows) {
      const s = value.trim();
      const key = s.toLowerCase();
      if (s === "" || seen.has(key)) continue;
      seen.add(key);
      cleaned.push(s);
    }
    if (cleaned.length === 0) {
      setNote({ kind: "err", text: "Add at least one strategy." });
      return;
    }
    const dropped = rows.length - cleaned.length;
    saveSettings.mutate({ strategies: cleaned }, {
      onSuccess: (s) => {
        setRows(s.strategies.map((value) => ({ id: crypto.randomUUID(), value })));
        setNote({
          kind: "ok",
          text: dropped > 0
            ? `Saved — removed ${dropped} blank or duplicate ${dropped === 1 ? "entry" : "entries"}.`
            : "Strategies saved.",
        });
      },
      onError: (err) => setNote({ kind: "err", text: err.message }),
    });
  }

  return (
    <section className="surface rounded-3xl p-6">
      <div className="mb-5 flex items-center gap-3.5">
        <div className="flex size-11 items-center justify-center rounded-full bg-primary/12 text-primary">
          <Tag className="size-5" />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">Strategies</h2>
          <p className="text-sm text-muted-foreground">
            Labels you can assign to holdings. Shared across every draft and month.
          </p>
        </div>
      </div>

      <ul className="grid gap-2">
        {rows.map((r, i) => (
          <li key={r.id} className="flex items-center gap-2">
            <Input
              value={r.value}
              onChange={(e) => setValue(r.id, e.target.value)}
              placeholder="Strategy name"
              maxLength={40}
            />
            <Button
              variant="ghost" size="icon" aria-label={`Remove strategy ${i + 1}`}
              onClick={() => removeRow(r.id)} disabled={rows.length <= 1}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>

      <Button
        variant="ghost" size="sm" onClick={addRow}
        className="mt-2 text-primary hover:bg-primary/10 hover:text-primary"
      >
        <Plus className="size-4" /> Add strategy
      </Button>

      {note && (
        <p className={note.kind === "ok" ? "mt-3 text-sm text-positive" : "mt-3 text-sm text-negative"}>
          {note.text}
        </p>
      )}

      <div className="mt-5">
        <Button onClick={save} disabled={saveSettings.isPending}>
          {saveSettings.isPending ? "Saving…" : "Save strategies"}
        </Button>
      </div>
    </section>
  );
}
