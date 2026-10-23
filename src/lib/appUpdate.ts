// The Android app offers newer test builds. CI publishes each build as the
// GitHub release `android-latest`, titled "Android test build N", with the
// APK as `bdgt.apk` (.github/workflows/android.yml).

export const LATEST_RELEASE = 'https://api.github.com/repos/pranjalagg/bdgt/releases/tags/android-latest';

export interface Release {
  name?: string | null;
  assets?: { name: string; browser_download_url: string }[];
}

export interface Update {
  build: number;
  url: string;
}

// "0.1.8" → 8: the last part of the installed version is its build number.
export function installedBuild(version: string): number | null {
  const m = /(\d+)\s*$/.exec(version);
  return m ? Number(m[1]) : null;
}

export function newerBuild(installedVersion: string, release: Release): Update | null {
  const installed = installedBuild(installedVersion);
  const build = Number(/\bbuild\s+(\d+)/i.exec(release.name ?? '')?.[1]);
  const apk = release.assets?.find((a) => a.name === 'bdgt.apk');
  if (installed === null || !Number.isInteger(build) || build <= installed || !apk) return null;
  return { build, url: apk.browser_download_url };
}

// Never throws: offline, no release yet or GitHub's rate limit just means no banner.
export async function checkForUpdate(installedVersion: string, fetchImpl: typeof fetch = fetch): Promise<Update | null> {
  try {
    const response = await fetchImpl(LATEST_RELEASE, { headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) return null;
    return newerBuild(installedVersion, (await response.json()) as Release);
  } catch {
    return null;
  }
}
