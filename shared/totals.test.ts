import { describe, expect, it } from "vitest";
import { emptyDraft } from "./schema.ts";
import { computeTotals, round2 } from "./totals.ts";

it("round2 rounds half up to cents", () => {
  expect(round2(1.005)).toBe(1.01);
  expect(round2(109350.014)).toBe(109350.01);
});

describe("computeTotals", () => {
  it("returns zeros for an empty draft", () => {
    expect(computeTotals(emptyDraft(), 1.3280)).toEqual({
      netWorthSgd: 0, portfolioUsd: 0, portfolioSgd: 0, savingsSgd: 0,
      cpfSgd: 0, propertySgd: 0, creditCardsSgd: 0, loansSgd: 0,
    });
  });

  it("converts portfolio at fx and subtracts liabilities", () => {
    const doc = {
      holdings: [
        { id: crypto.randomUUID(), ticker: "VOO", type: "etf" as const,
          quantity: 25, priceUsd: 603.79, valueUsd: 15094.75, asOf: "2026-07-01" },
        { id: crypto.randomUUID(), ticker: "BTC", type: "crypto" as const,
          quantity: 0.42, priceUsd: 106535, valueUsd: 44744.7, asOf: "2026-07-01" },
      ],
      assets: {
        bankSavings: [{ id: crypto.randomUUID(), name: "DBS", balanceSgd: 49646, asOf: "2026-07-01" }],
        cpf: [{ id: crypto.randomUUID(), name: "CPF", balanceSgd: 146544, asOf: "2026-07-01" }],
        property: [],
      },
      liabilities: {
        creditCards: [{ id: crypto.randomUUID(), name: "DBS Altitude", balanceSgd: 1757.5, asOf: "2026-07-01" }],
        loans: [{ id: crypto.randomUUID(), name: "HDB", balanceSgd: 391400, asOf: "2026-07-01" }],
      },
    };
    const t = computeTotals(doc, 1.328);
    expect(t.portfolioUsd).toBe(59839.45);
    expect(t.portfolioSgd).toBe(79466.79);          // 59839.45 × 1.328
    expect(t.savingsSgd).toBe(49646);
    expect(t.cpfSgd).toBe(146544);
    expect(t.creditCardsSgd).toBe(1757.5);
    expect(t.loansSgd).toBe(391400);
    expect(t.netWorthSgd).toBe(round2(79466.79 + 49646 + 146544 - 1757.5 - 391400));
  });
});
