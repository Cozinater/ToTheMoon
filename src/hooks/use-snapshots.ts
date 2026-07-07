import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AmendInput, CloseInput, Snapshot, Totals } from "@shared/schema";
import { api } from "@/lib/api";
import { draftKey } from "@/hooks/use-draft";

export type SnapshotSummary = { month: string; snapshotDate: string; fxRate: number; totals: Totals };

export function useSnapshots() {
  return useQuery({
    queryKey: ["snapshots"],
    queryFn: () => api<{ snapshots: SnapshotSummary[] }>("/api/snapshots").then((r) => r.snapshots),
  });
}

export function useSnapshot(month: string, enabled = true) {
  return useQuery({
    queryKey: ["snapshot", month],
    queryFn: () => api<Snapshot>(`/api/snapshots/${month}`),
    enabled,
  });
}

export function useCloseMonth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CloseInput) =>
      api<Snapshot>("/api/close", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["snapshots"] });
      qc.invalidateQueries({ queryKey: draftKey });
    },
  });
}

export function useAmendSnapshot(month: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AmendInput) =>
      api<Snapshot>(`/api/snapshots/${month}`, { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: (snap) => {
      qc.setQueryData(["snapshot", month], snap);
      qc.invalidateQueries({ queryKey: ["snapshots"] });
    },
  });
}

export function useResetAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ deleted: number }>("/api/reset", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });
}
