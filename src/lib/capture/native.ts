import type { PluginListenerHandle } from '@capacitor/core';
import { isAndroidPlatform, loadPlugin, type PluginHandle } from '$lib/android';

// The bridge to payment capture in the Android app. In a browser none of it
// loads: Capacitor is imported only when the page runs inside the app.

export type CaptureKind = 'app' | 'sms';

export interface KeptItem {
  id: string;
  packageName: string;
  kind: CaptureKind;
  notificationKey: string;
  postedAt: number; // epoch ms the notification or message arrived
  sender?: string;
  title?: string;
  text: string;
  extras?: Record<string, string>;
}

export interface CaptureStatus {
  available: boolean;
  accessGranted: boolean; // notification access is on for the app
  listenerConnected: boolean;
  enabled: boolean; // recording is on
  lastKeptAt: number; // epoch ms, 0 before anything was kept
  count: number;
  appVersion: string;
}

export interface InstalledSource {
  packageName: string;
  label: string;
  kind: CaptureKind;
}

export interface CapturePlugin {
  getStatus(): Promise<CaptureStatus>;
  setConfig(options: { enabled?: boolean; packages?: string[]; sms?: boolean }): Promise<void>;
  installedSources(): Promise<{ sources: InstalledSource[] }>;
  openAccessSettings(): Promise<void>;
  openBatterySettings(): Promise<void>;
  requestRebind(): Promise<void>;
  list(options?: { limit?: number }): Promise<{ items: KeptItem[] }>;
  clear(): Promise<void>;
  share(options: { filename: string; text: string; mimeType: string }): Promise<void>;
  addListener(event: 'itemKept', listener: (item: KeptItem) => void): Promise<PluginListenerHandle>;
}

export type CaptureHandle = PluginHandle<CapturePlugin>;

// Under `npm run dev`, `window.__bdgtCapture` stands in for the plugin so the
// screens can be looked at in a browser.
function devPlugin(): CapturePlugin | undefined {
  if (!import.meta.env.DEV || typeof window === 'undefined') return undefined;
  return (window as unknown as { __bdgtCapture?: CapturePlugin }).__bdgtCapture;
}

// True inside the Android app (or with the development stand-in).
export function isAndroidApp(win?: unknown): boolean {
  return !!devPlugin() || (win === undefined ? isAndroidPlatform() : isAndroidPlatform(win));
}

export function getCapture(): Promise<CaptureHandle | null> {
  const fake = devPlugin();
  if (fake) return Promise.resolve({ plugin: fake });
  if (!isAndroidApp()) return Promise.resolve(null);
  return loadPlugin<CapturePlugin>('Capture');
}
