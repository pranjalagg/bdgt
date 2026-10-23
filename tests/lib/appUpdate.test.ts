import { describe, it, expect, vi } from 'vitest';
import { installedBuild, newerBuild, checkForUpdate, LATEST_RELEASE } from '$lib/appUpdate';

const release = (name: string, assets = [{ name: 'bdgt.apk', browser_download_url: 'https://github.com/x/bdgt.apk' }]) => ({ name, assets });

describe('installedBuild', () => {
  it('reads the build number from the app version', () => {
    expect(installedBuild('0.1.8')).toBe(8);
    expect(installedBuild('0.1.12')).toBe(12);
    expect(installedBuild('dev')).toBeNull();
  });
});

describe('newerBuild', () => {
  it('offers a newer build with its download', () => {
    expect(newerBuild('0.1.8', release('Android test build 9'))).toEqual({ build: 9, url: 'https://github.com/x/bdgt.apk' });
  });

  it('offers nothing for the same or an older build, an unreadable title or a missing APK', () => {
    expect(newerBuild('0.1.9', release('Android test build 9'))).toBeNull();
    expect(newerBuild('0.1.10', release('Android test build 9'))).toBeNull();
    expect(newerBuild('0.1.8', release('Something else'))).toBeNull();
    expect(newerBuild('0.1.8', release('Android test build 9', []))).toBeNull();
    expect(newerBuild('dev', release('Android test build 9'))).toBeNull();
  });
});

describe('checkForUpdate', () => {
  it('asks GitHub for the latest Android release', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(release('Android test build 9'))));
    expect(await checkForUpdate('0.1.8', fetchImpl as unknown as typeof fetch)).toMatchObject({ build: 9 });
    expect(fetchImpl).toHaveBeenCalledWith(LATEST_RELEASE, expect.anything());
  });

  it('stays quiet when GitHub cannot be reached or answers with an error', async () => {
    expect(await checkForUpdate('0.1.8', (async () => new Response('', { status: 403 })) as unknown as typeof fetch)).toBeNull();
    expect(await checkForUpdate('0.1.8', (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch)).toBeNull();
  });
});
