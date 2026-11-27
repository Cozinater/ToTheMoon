import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Income } from "@shared/schema";
import { api } from "@/lib/api";

export const incomeKey = ["income"] as const;

export function useIncome() {
  return useQuery({ queryKey: incomeKey, queryFn: () => api<Income>("/api/income") });
}

/** Saves the whole list. The screen updates at once and rolls back if the server refuses. */
export function useSaveIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (income: Income) =>
      api<Income>("/api/income", { method: "PUT", body: JSON.stringify(income) }),
    onMutate: async (income) => {
      await qc.cancelQueries({ queryKey: incomeKey });
      const previous = qc.getQueryData<Income>(incomeKey);
      qc.setQueryData<Income>(incomeKey, income);
      return { previous };
    },
    onError: (_err, _income, ctx) => {
      if (ctx?.previous) qc.setQueryData(incomeKey, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: incomeKey }),
  });
}
