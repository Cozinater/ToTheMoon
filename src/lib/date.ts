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
