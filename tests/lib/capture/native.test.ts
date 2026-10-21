import { describe, it, expect, afterEach } from 'vitest';
import { isAndroidApp, getCapture, type CapturePlugin } from '$lib/capture/native';

const capacitor = (platform: string, native: boolean) => ({
  Capacitor: { isNativePlatform: () => native, getPlatform: () => platform },
});

describe('isAndroidApp', () => {
  it('is true only inside the Android app', () => {
    expect(isAndroidApp(capacitor('android', true))).toBe(true);
    expect(isAndroidApp(capacitor('ios', true))).toBe(false);
    expect(isAndroidApp(capacitor('web', false))).toBe(false);
    expect(isAndroidApp({})).toBe(false);
    expect(isAndroidApp(undefined)).toBe(false);
  });

  it('is false when the bridge misbehaves', () => {
    const broken = {
      Capacitor: {
        isNativePlatform: () => {
          throw new Error('no bridge');
        },
      },
    };
    expect(isAndroidApp(broken)).toBe(false);
  });
});

describe('getCapture', () => {
  afterEach(() => {
    delete (window as unknown as { __bdgtCapture?: unknown }).__bdgtCapture;
  });

  it('gives nothing in a browser and never loads Capacitor', async () => {
    expect(await getCapture()).toBeNull();
  });

  it('hands out the development stand-in inside a box', async () => {
    const fake = { getStatus: async () => ({}) } as unknown as CapturePlugin;
    (window as unknown as { __bdgtCapture?: CapturePlugin }).__bdgtCapture = fake;
    expect(isAndroidApp()).toBe(true);
    expect(await getCapture()).toEqual({ plugin: fake });
  });
});
