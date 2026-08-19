/**
 * The capture entry points (UC-005 quick add, UC-006 brief upload, UC-007
 * bulk paste, UC-002 full form) live in the Shell so they are reachable from
 * every view. Pages deeper in the tree — the dashboard's "three ways in"
 * empty state — ask the Shell to open one through this tiny event seam,
 * which keeps the app at its two contexts.
 */

export type CaptureMode = 'form' | 'nl' | 'brief' | 'paste';

const EVENT = 'deadlineiq:capture';

export function openCapture(mode: CaptureMode) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: mode }));
}

export function onCapture(handler: (mode: CaptureMode) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
