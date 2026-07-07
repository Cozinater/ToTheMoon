import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Draft, DraftInput } from "@shared/schema";
import { api } from "@/lib/api";

export const draftKey = ["draft"] as const;

export function useDraft() {
  return useQuery({ queryKey: draftKey, queryFn: () => api<Draft>("/api/draft") });
}

export function useSaveDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: DraftInput) =>
      api<Draft>("/api/draft", { method: "PUT", body: JSON.stringify(draft) }),
    onMutate: async (draft) => {
      await qc.cancelQueries({ queryKey: draftKey });
      const previous = qc.getQueryData<Draft>(draftKey);
      qc.setQueryData<Draft>(draftKey, { ...draft, updatedAt: new Date().toISOString() });
      return { previous };
    },
    onError: (_err, _draft, ctx) => {
      if (ctx?.previous) qc.setQueryData(draftKey, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: draftKey }),
  });
}
