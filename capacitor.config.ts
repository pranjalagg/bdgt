import type { CapacitorConfig } from '@capacitor/cli';

// The Android app wraps the static build. Build it with an empty base path
// first (BASE_PATH= npm run build), then `npx cap sync android`.
const config: CapacitorConfig = {
  appId: 'io.github.pranjalagg.bdgt',
  appName: 'bdgt',
  webDir: 'build',
};

export default config;
