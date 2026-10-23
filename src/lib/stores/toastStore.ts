import { writable, type Readable } from 'svelte/store';

// One message at a time at the top of the screen, often with Undo. A new
// one replaces the current one.

export interface ToastState {
  message: string;
  envelopeId?: string;
  action?: { label: string; run: () => void };
}

const DEFAULT_MS = 2200;
const WITH_ACTION_MS = 4200;

const current = writable<ToastState | null>(null);
export const toast: Readable<ToastState | null> = { subscribe: current.subscribe };
let timer: ReturnType<typeof setTimeout> | undefined;

export function showToast(t: ToastState & { ms?: number }): void {
  const { ms, ...state } = t;
  clearTimeout(timer);
  current.set(state);
  timer = setTimeout(dismissToast, ms ?? (state.action ? WITH_ACTION_MS : DEFAULT_MS));
}

export function dismissToast(): void {
  clearTimeout(timer);
  current.set(null);
}
