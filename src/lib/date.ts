import { format } from "date-fns";

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse "yyyy-mm-dd" into a local-time Date. Returns undefined for anything else. */
export function parseYmd(value: string): Date | undefined {
  const m = YMD.exec(value);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  const overflowed = date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d;
  return overflowed ? undefined : date;
}

export function toYmd(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** "2026-07-11" → "11 Jul 2026"; empty/invalid input → "". */
export function formatDisplayDate(value: string): string {
  const date = parseYmd(value);
  return date ? format(date, "d MMM yyyy") : "";
}

const YM = /^(\d{4})-(\d{2})$/;

/** Parse "yyyy-mm" into 1-based { year, month }. Returns undefined for anything else. */
export function parseYm(value: string): { year: number; month: number } | undefined {
  const m = YM.exec(value);
  if (!m) return undefined;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return undefined;
  return { year, month };
}

/** 1-based year/month → zero-padded "yyyy-mm". */
export function toYm(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** "2026-07" → "Jul 2026"; empty/invalid input → "". */
export function formatDisplayMonth(value: string): string {
  const parsed = parseYm(value);
  return parsed ? format(new Date(parsed.year, parsed.month - 1, 1), "MMM yyyy") : "";
}

/** Today as "yyyy-mm". */
export function currentYm(): string {
  const d = new Date();
  return toYm(d.getFullYear(), d.getMonth() + 1);
}
