import { useSyncExternalStore } from 'react';

// App-wide light/dark theme. The choice is saved per browser; before a choice is made the
// device setting is followed. Dark mode is the `dark` class on <html> (see index.css).

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'uim_theme';
const LEGACY_KEY = 'uim_auth_theme'; // used by the first log-in-only version

function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch { return null; }
}

function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

let current: Theme = savedTheme() ?? systemTheme();
const listeners = new Set<() => void>();

export function applyTheme(theme: Theme = current) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

export function setTheme(theme: Theme) {
  current = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
    localStorage.removeItem(LEGACY_KEY);
  } catch { /* storage is optional */ }
  applyTheme(theme);
  listeners.forEach((listener) => listener());
}

export function toggleTheme() {
  setTheme(current === 'dark' ? 'light' : 'dark');
}

// Follow the device setting live until the user picks a theme themselves.
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (savedTheme()) return;
    current = systemTheme();
    applyTheme(current);
    listeners.forEach((listener) => listener());
  });
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => current,
  );
}
