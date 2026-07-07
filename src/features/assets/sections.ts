import { Banknote, Building2, CreditCard, Landmark, PiggyBank } from "lucide-react";
import type { ComponentType } from "react";
import type { Assets, Liabilities } from "@shared/schema";
import { SECTION_LIMITS } from "@shared/schema";

export type AssetSectionKey = keyof Assets;
export type LiabilitySectionKey = keyof Liabilities;

type Section<K> = { key: K; title: string; limit: number; icon: ComponentType<{ className?: string }> };

export const ASSET_SECTIONS: Section<AssetSectionKey>[] = [
  { key: "bankSavings", title: "Bank Savings", limit: SECTION_LIMITS.bankSavings, icon: PiggyBank },
  { key: "cpf", title: "CPF", limit: SECTION_LIMITS.cpf, icon: Landmark },
  { key: "property", title: "Property", limit: SECTION_LIMITS.property, icon: Building2 },
];

export const LIABILITY_SECTIONS: Section<LiabilitySectionKey>[] = [
  { key: "creditCards", title: "Credit Cards", limit: SECTION_LIMITS.creditCards, icon: CreditCard },
  { key: "loans", title: "Loans", limit: Number.POSITIVE_INFINITY, icon: Banknote },
];
