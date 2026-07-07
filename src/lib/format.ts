const sgdFmt = new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" });
const usdFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const compactFmt = new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", notation: "compact", maximumFractionDigits: 1 });
const qtyFmt = new Intl.NumberFormat("en-SG", { maximumFractionDigits: 8 });

export const sgd = (n: number) => sgdFmt.format(n);
export const usd = (n: number) => usdFmt.format(n);
export const compactSgd = (n: number) => compactFmt.format(n);
export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
export const qty = (n: number) => qtyFmt.format(n);
export const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-SG", { month: "short", year: "numeric", timeZone: "UTC" });
export const dateLabel = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
