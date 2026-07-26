/**
 * A day-scoped key/value cache. An entry is a cache hit only when it was stored
 * on the same `day` (YYYY-MM-DD) that the read asks for — end-of-day prices and
 * the daily FX rate only change once a day, so a value fetched today is reused
 * all day and re-fetched once the calendar day rolls over.
 */
export interface DayCache {
  get<T>(keys: string[], day: string): Promise<Map<string, T>>;
  put<T>(entries: { key: string; value: T }[], day: string): Promise<void>;
}

export class MemoryDayCache implements DayCache {
  private store = new Map<string, { day: string; value: unknown }>();

  async get<T>(keys: string[], day: string): Promise<Map<string, T>> {
    const out = new Map<string, T>();
    for (const key of keys) {
      const entry = this.store.get(key);
      if (entry && entry.day === day) out.set(key, entry.value as T);
    }
    return out;
  }

  async put<T>(entries: { key: string; value: T }[], day: string): Promise<void> {
    for (const { key, value } of entries) this.store.set(key, { day, value });
  }
}
