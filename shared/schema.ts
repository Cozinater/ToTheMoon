import { z } from "zod";

export const SECTION_LIMITS = { bankSavings: 5, cpf: 4, property: 1, creditCards: 5 } as const;

const isoDate = z.iso.date();       // "YYYY-MM-DD"
const isoDateTime = z.iso.datetime();
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "expected YYYY-MM");

export const assetTypeSchema = z.enum(["stock", "etf", "crypto"]);
export type AssetType = z.infer<typeof assetTypeSchema>;

export const holdingSchema = z.object({
  id: z.uuid(),
  ticker: z.string().min(1).max(12),
  type: assetTypeSchema,
  quantity: z.number().positive(),
  priceUsd: z.number().nonnegative(),
  valueUsd: z.number().nonnegative(),
  asOf: isoDate,
  strategy: z.string().min(1).max(40).optional(),
});
export type Holding = z.infer<typeof holdingSchema>;

export const DEFAULT_STRATEGIES = ["China", "Turn Around", "Speculative", "Long Term"] as const;

export const settingsSchema = z.object({
  strategies: z.array(z.string().min(1).max(40)).min(1).max(20),
});
export type Settings = z.infer<typeof settingsSchema>;

export function defaultSettings(): Settings {
  return { strategies: [...DEFAULT_STRATEGIES] };
}

export const entrySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(60),
  balanceSgd: z.number().nonnegative(),
  asOf: isoDate,
});
export type Entry = z.infer<typeof entrySchema>;

export const assetsSchema = z.object({
  bankSavings: z.array(entrySchema).max(SECTION_LIMITS.bankSavings),
  cpf: z.array(entrySchema).max(SECTION_LIMITS.cpf),
  property: z.array(entrySchema).max(SECTION_LIMITS.property),
});
export type Assets = z.infer<typeof assetsSchema>;

export const liabilitiesSchema = z.object({
  creditCards: z.array(entrySchema).max(SECTION_LIMITS.creditCards),
  loans: z.array(entrySchema),
});
export type Liabilities = z.infer<typeof liabilitiesSchema>;

export const draftInputSchema = z.object({
  holdings: z.array(holdingSchema),
  assets: assetsSchema,
  liabilities: liabilitiesSchema,
  fxRate: z.number().positive().optional(),
});
export type DraftInput = z.infer<typeof draftInputSchema>;

export const draftSchema = draftInputSchema.extend({
  updatedAt: isoDateTime.optional(),
});
export type Draft = z.infer<typeof draftSchema>;

export const totalsSchema = z.object({
  netWorthSgd: z.number(), portfolioUsd: z.number(), portfolioSgd: z.number(),
  savingsSgd: z.number(), cpfSgd: z.number(), propertySgd: z.number(),
  creditCardsSgd: z.number(), loansSgd: z.number(),
});
export type Totals = z.infer<typeof totalsSchema>;

export const snapshotSchema = z.object({
  month: monthSchema,
  snapshotDate: isoDate,
  fxRate: z.number().positive(),
  closedAt: isoDateTime,
  holdings: z.array(holdingSchema),
  assets: assetsSchema,
  liabilities: liabilitiesSchema,
  totals: totalsSchema,
});
export type Snapshot = z.infer<typeof snapshotSchema>;

export const closeInputSchema = z.object({
  snapshotDate: isoDate,
  fxRate: z.number().positive().optional(),
});
export type CloseInput = z.infer<typeof closeInputSchema>;

export const amendInputSchema = z.object({
  snapshotDate: isoDate,
  fxRate: z.number().positive(),
  holdings: z.array(holdingSchema),
  assets: assetsSchema,
  liabilities: liabilitiesSchema,
});
export type AmendInput = z.infer<typeof amendInputSchema>;

export function emptyDraft(): Draft {
  return {
    holdings: [],
    assets: { bankSavings: [], cpf: [], property: [] },
    liabilities: { creditCards: [], loans: [] },
  };
}
