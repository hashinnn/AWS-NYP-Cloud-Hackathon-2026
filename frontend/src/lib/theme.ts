/**
 * Light / dark / system, stored per student.
 *
 * The chrome swaps through CSS variables, so nothing in the DOM needs to know
 * which mode it is in. Canvas is the exception — Chart.js paints pixels, not
 * styles — so `readToken` hands it the resolved value at render time.
 */

export type ThemeChoice = 'light' | 'dark' | 'system';

const KEY = 'deadlineiq.theme';

export function getTheme(): ThemeChoice {
  const stored = localStorage.getItem(KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') {
    root.removeAttribute('data-theme');
    localStorage.removeItem(KEY);
  } else {
    root.setAttribute('data-theme', choice);
    localStorage.setItem(KEY, choice);
  }
  // Canvas colours are resolved once at paint, so charts have to be told.
  window.dispatchEvent(new CustomEvent('themechange'));
}

/** What the page is actually rendering right now. */
export function resolvedMode(): 'light' | 'dark' {
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit === 'dark' || explicit === 'light') return explicit;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Resolve a CSS custom property to the value the browser is using. */
export function readToken(name: string, fallback = '#000'): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}
