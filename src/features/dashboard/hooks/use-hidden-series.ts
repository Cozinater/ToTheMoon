import { useState } from "react";
import {
  parseHiddenSeries,
  serializeHiddenSeries,
  toggleSeries,
  type SeriesKey,
} from "../lib/chart-series";

const KEY = "tothemoon:chart-hidden-series";

// Safari private mode throws on both reads and writes; a storage failure should
// cost the user their saved selection, not the dashboard.
const load = (): SeriesKey[] => {
  try {
    return parseHiddenSeries(localStorage.getItem(KEY));
  } catch {
    return [];
  }
};

const save = (hidden: SeriesKey[]) => {
  try {
    localStorage.setItem(KEY, serializeHiddenSeries(hidden));
  } catch {
    // Nothing to do — the in-memory selection still works for this session.
  }
};

export function useHiddenSeries(): [SeriesKey[], (key: SeriesKey) => void] {
  const [hidden, setHidden] = useState<SeriesKey[]>(load);
  const toggle = (key: SeriesKey) => {
    setHidden((current) => {
      const next = toggleSeries(current, key);
      save(next);
      return next;
    });
  };
  return [hidden, toggle];
}
