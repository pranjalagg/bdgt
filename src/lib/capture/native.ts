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
  count: number; // in the log
  waiting: number; // not yet brought into the review queue
  sms: boolean; // bank SMS are read
  packages?: string[]; // payment apps read; absent means every supported one
  appVersion: string;
}

export interface InstalledSource {
  packageName: string;
  label: string;
  kind: CaptureKind;
}

// Which log items to show or clear: absent, every item (a build without
// sync); null, items no account has taken yet (signed out); an account id,
// those plus the account's own. One person never sees another's log.
export interface LogScope {
  visibleTo?: string | null;
}

export interface CapturePlugin {
  getStatus(options?: LogScope): Promise<CaptureStatus>; // `count` is within the scope
  setConfig(options: { enabled?: boolean; packages?: string[]; sms?: boolean }): Promise<void>;
  installedSources(): Promise<{ sources: InstalledSource[] }>;
  openAccessSettings(): Promise<void>;
  openBatterySettings(): Promise<void>;
  requestRebind(): Promise<void>;
  list(options?: { limit?: number } & LogScope): Promise<{ items: KeptItem[] }>;
  clear(options?: LogScope): Promise<void>; // empties the log within the scope
  takePending(options?: { limit?: number }): Promise<{ items: KeptItem[] }>; // oldest first, kept until ack
  ack(options: { ids: string[]; owner?: string }): Promise<void>; // owner: the account whose queue got them
  claim(options: { owner: string }): Promise<void>; // items brought in before owners existed
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
