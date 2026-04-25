# PWA Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert SvelteKit budget app to installable PWA for Android.

**Architecture:** Add manifest.json for install metadata, service worker for caching app shell, and required icons. App already has IndexedDB storage and responsive design — just need PWA layer.

**Tech Stack:** SvelteKit built-in service worker support (`$service-worker` module), Web App Manifest, static PNG icons.

---

## File Structure

```
New files:
├── static/manifest.json           # PWA manifest
├── static/icons/
│   ├── icon-192.png              # Standard icon
│   ├── icon-512.png              # Large icon (splash)
│   ├── icon-512-maskable.png     # Adaptive icon (Android)
│   └── apple-touch-icon.png      # iOS home screen
└── src/service-worker.ts         # Cache management

Modified files:
└── src/app.html                  # Manifest link + meta tags
```

---

### Task 1: Create PWA Manifest

**Files:**
- Create: `static/manifest.json`

- [ ] **Step 1: Create manifest file**

```json
{
  "name": "Budget App",
  "short_name": "Budget",
  "description": "Zero-based budgeting",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#fafafa",
  "theme_color": "#3b82f6",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

- [ ] **Step 2: Verify JSON is valid**

Run: `cat static/manifest.json | python3 -m json.tool > /dev/null && echo "Valid JSON"`
Expected: "Valid JSON"

- [ ] **Step 3: Commit**

```bash
git add static/manifest.json
git commit -m "feat: add PWA manifest"
```

---

### Task 2: Create App Icons

**Files:**
- Create: `static/icons/icon-192.png`
- Create: `static/icons/icon-512.png`
- Create: `static/icons/icon-512-maskable.png`
- Create: `static/icons/apple-touch-icon.png`

- [ ] **Step 1: Create icons directory**

```bash
mkdir -p static/icons
```

- [ ] **Step 2: Generate icons from SVG**

Create base SVG at `static/icons/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#3b82f6" rx="64"/>
  <text x="256" y="340" font-family="system-ui, sans-serif" font-size="280" font-weight="bold" fill="white" text-anchor="middle">B</text>
</svg>
```

- [ ] **Step 3: Convert SVG to required PNG sizes**

Option A — Use online tool:
1. Go to https://realfavicongenerator.net or https://maskable.app/editor
2. Upload SVG, download PNG pack

Option B — Use ImageMagick (if installed):
```bash
convert -background none -resize 192x192 static/icons/icon.svg static/icons/icon-192.png
convert -background none -resize 512x512 static/icons/icon.svg static/icons/icon-512.png
convert -background none -resize 512x512 static/icons/icon.svg static/icons/icon-512-maskable.png
convert -background none -resize 180x180 static/icons/icon.svg static/icons/apple-touch-icon.png
```

Note: Maskable icon should have ~20% padding (safe zone). If using realfavicongenerator, it handles this automatically.

- [ ] **Step 4: Verify icons exist**

```bash
ls -la static/icons/
```

Expected: 4 PNG files (icon-192.png, icon-512.png, icon-512-maskable.png, apple-touch-icon.png)

- [ ] **Step 5: Commit**

```bash
git add static/icons/
git commit -m "feat: add PWA app icons"
```

---

### Task 3: Create Service Worker

**Files:**
- Create: `src/service-worker.ts`

- [ ] **Step 1: Create service worker file**

```typescript
/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

declare let self: ServiceWorkerGlobalScope;

const CACHE_NAME = `cache-${version}`;

const ASSETS = [
  ...build,
  ...files
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request);
      })
  );
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run check`
Expected: No errors related to service-worker.ts

- [ ] **Step 3: Commit**

```bash
git add src/service-worker.ts
git commit -m "feat: add service worker for offline caching"
```

---

### Task 4: Update app.html with PWA Meta Tags

**Files:**
- Modify: `src/app.html:4-6` (add after viewport meta)

- [ ] **Step 1: Add manifest link and meta tags**

Insert after line 6 (`<meta name="text-scale" content="scale" />`):

```html
		<link rel="manifest" href="/manifest.json" />
		<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
		<meta name="theme-color" content="#3b82f6" />
		<meta name="apple-mobile-web-app-capable" content="yes" />
		<meta name="apple-mobile-web-app-status-bar-style" content="default" />
```

Full head section should look like:

```html
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<meta name="text-scale" content="scale" />
		<link rel="manifest" href="/manifest.json" />
		<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
		<meta name="theme-color" content="#3b82f6" />
		<meta name="apple-mobile-web-app-capable" content="yes" />
		<meta name="apple-mobile-web-app-status-bar-style" content="default" />
		<script>
			(function() {
				const stored = localStorage.getItem('theme-preference');
				const preference = stored === 'light' || stored === 'dark' ? stored : 'system';
				const isDark = preference === 'dark' ||
					(preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
				if (isDark) {
					document.documentElement.classList.add('dark');
				}
			})();
		</script>
		%sveltekit.head%
	</head>
```

- [ ] **Step 2: Verify HTML is valid**

Run: `npm run check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app.html
git commit -m "feat: add PWA meta tags to app.html"
```

---

### Task 5: Build and Test PWA

**Files:**
- None (testing only)

- [ ] **Step 1: Build the app**

Run: `npm run build`
Expected: Build completes without errors, `build/` folder contains manifest.json and service-worker.js

- [ ] **Step 2: Verify build output**

```bash
ls build/manifest.json build/icons/ build/_app/immutable/workers/
```

Expected: manifest.json exists, icons folder exists with PNGs, workers folder contains service-worker-*.js

- [ ] **Step 3: Start preview server**

Run: `npm run preview`
Expected: Server starts at http://localhost:4173

- [ ] **Step 4: Test in Chrome DevTools**

1. Open http://localhost:4173 in Chrome
2. DevTools → Application tab
3. Check "Manifest" section — should show app name, icons
4. Check "Service Workers" — should show registered worker
5. Check "Cache Storage" — should show cached assets

- [ ] **Step 5: Run Lighthouse PWA audit**

1. DevTools → Lighthouse tab
2. Select "Progressive Web App" category
3. Run audit
Expected: PWA badge, installable

- [ ] **Step 6: Test offline mode**

1. DevTools → Network tab → check "Offline"
2. Refresh page
Expected: App loads from cache, IndexedDB data works

- [ ] **Step 7: Test install on Android (optional)**

1. Deploy to GitHub Pages or use ngrok for local testing
2. Open in Chrome on Android
3. Chrome should show "Add to Home Screen" in menu
4. Install and verify standalone mode (no browser chrome)

---

## Completion Checklist

- [ ] manifest.json created with correct icons
- [ ] All 4 icon sizes present
- [ ] Service worker caches app shell
- [ ] app.html has manifest link and meta tags
- [ ] Lighthouse PWA audit passes
- [ ] App works offline
