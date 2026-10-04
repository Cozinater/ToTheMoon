import { useState } from "react";

const KEY = "tothemoon:sidebar-collapsed";

type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

// Safari private mode throws on both reads and writes; a storage failure should
// cost the user their saved preference, not the layout.
export function readCollapsed(storage: KeyValueStore): boolean {
  try {
    return storage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function writeCollapsed(storage: KeyValueStore, collapsed: boolean) {
  try {
    storage.setItem(KEY, collapsed ? "1" : "0");
  } catch {
    // Nothing to do — the in-memory state still works for this session.
  }
}

// Merely touching `localStorage` can throw when site data is blocked, so it is only
// dereferenced inside calls that readCollapsed/writeCollapsed already guard.
const browserStorage: KeyValueStore = {
  getItem: (k) => localStorage.getItem(k),
  setItem: (k, v) => localStorage.setItem(k, v),
};

/** Desktop sidebar collapsed to its icon rail, remembered per browser. */
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(browserStorage));
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    writeCollapsed(browserStorage, next);
  };
  return [collapsed, toggle];
}
