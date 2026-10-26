import { useSyncExternalStore } from "react";

/**
 * The colour theme: the reader's choice, stored per browser. "system" follows
 * the operating system and changes with it. `index.html` applies the stored
 * choice before the first paint with the same rules (keep them in step);
 * this module takes over once the app runs.
 */
export type ThemePreference = "dark" | "light" | "system";

const STORAGE_KEY = "emitkit:theme";

/** The browser chrome colour per theme: Mist and Midnight (brand kit). */
const THEME_COLOR = { dark: "#050606", light: "#f4f4f2" } as const;

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

const isPreference = (value: unknown): value is ThemePreference =>
  value === "dark" || value === "light" || value === "system";

const readPreference = (): ThemePreference => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isPreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
};

const resolve = (preference: ThemePreference): "dark" | "light" => {
  if (preference === "system") {
    return darkQuery().matches ? "dark" : "light";
  }
  return preference;
};

const apply = (preference: ThemePreference) => {
  const theme = resolve(preference);
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLOR[theme]);
};

const listeners = new Set<() => void>();
let current = readPreference();

const update = (preference: ThemePreference) => {
  current = preference;
  apply(preference);
  for (const listener of listeners) {
    listener();
  }
};

/** Follows the OS under "system", and choices made in other tabs. */
export const startTheme = () => {
  apply(current);
  darkQuery().addEventListener("change", () => {
    if (current === "system") {
      apply(current);
    }
  });
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      update(readPreference());
    }
  });
};

export const setThemePreference = (preference: ThemePreference) => {
  try {
    if (preference === "system") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, preference);
    }
  } catch {
    // Storage unavailable: the choice lasts until the page reloads.
  }
  update(preference);
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useThemePreference = (): ThemePreference =>
  useSyncExternalStore(subscribe, () => current);
