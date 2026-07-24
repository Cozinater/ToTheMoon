import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Settings } from "@shared/schema";
import { api } from "@/lib/api";

export const settingsKey = ["settings"] as const;

export function useSettings() {
  return useQuery({ queryKey: settingsKey, queryFn: () => api<Settings>("/api/settings") });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: Settings) =>
      api<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(settings) }),
    onMutate: async (settings) => {
      await qc.cancelQueries({ queryKey: settingsKey });
      const previous = qc.getQueryData<Settings>(settingsKey);
      qc.setQueryData<Settings>(settingsKey, settings);
      return { previous };
    },
    onError: (_err, _settings, ctx) => {
      if (ctx?.previous) qc.setQueryData(settingsKey, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: settingsKey }),
  });
}
