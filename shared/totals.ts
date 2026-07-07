import type { Assets, Holding, Liabilities, Totals } from "./schema.ts";

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const sum = (entries: { balanceSgd: number }[]) =>
  round2(entries.reduce((acc, e) => acc + e.balanceSgd, 0));

export function computeTotals(
  doc: { holdings: Holding[]; assets: Assets; liabilities: Liabilities },
  fxRate: number,
): Totals {
  const portfolioUsd = round2(doc.holdings.reduce((acc, h) => acc + h.valueUsd, 0));
  const portfolioSgd = round2(portfolioUsd * fxRate);
  const savingsSgd = sum(doc.assets.bankSavings);
  const cpfSgd = sum(doc.assets.cpf);
  const propertySgd = sum(doc.assets.property);
  const creditCardsSgd = sum(doc.liabilities.creditCards);
  const loansSgd = sum(doc.liabilities.loans);
  return {
    portfolioUsd, portfolioSgd, savingsSgd, cpfSgd, propertySgd,
    creditCardsSgd, loansSgd,
    netWorthSgd: round2(portfolioSgd + savingsSgd + cpfSgd + propertySgd - creditCardsSgd - loansSgd),
  };
}
