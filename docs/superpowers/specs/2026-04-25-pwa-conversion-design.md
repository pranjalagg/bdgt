# PWA Conversion Design Specification

## Overview

Convert existing SvelteKit budget app to Progressive Web App for Android installability and offline access. Minimal approach — leverage existing offline-capable architecture.

## Current State

- SvelteKit with static adapter
- IndexedDB via Dexie.js (already offline-capable)
- Responsive design (bottom nav mobile, sidebar desktop)
- Hosted on GitHub Pages (HTTPS included)

## Goals

- Installable on Android via Chrome "Add to Home Screen"
- Full offline functionality (already works, need service worker for caching)
- Native app feel (standalone display, no browser chrome)
- Minimal implementation — no Workbox, no push notifications

## PWA Manifest

```json
{
  "name": "Budget App",
  "short_name": "Budget",
  "description": "Zero-based budgeting",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#fafafa",
  "theme_color": "#3b82f6",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- `display: standalone` removes browser chrome
- `theme_color` matches app accent (#3b82f6 blue)
- Maskable icon for Android adaptive icons

## Service Worker

Uses SvelteKit's built-in `$service-worker` module.

### Caching Strategy

- **Precache on install:** HTML shell, JS bundles, CSS, static assets, icons
- **Versioned cache:** Old caches cleared on service worker update
- **No network fetching needed:** All data in IndexedDB

### Update Flow

- New version detected → cache updated in background
- Next page load uses new version
- No "update available" prompts (single-user app)

### Implementation

```typescript
// src/service-worker.ts
import { build, files, version } from '$service-worker';

const CACHE_NAME = `cache-${version}`;
const ASSETS = [...build, ...files];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
```

## Icons

```
static/icons/
├── icon-192.png           (192x192, standard)
├── icon-512.png           (512x512, splash screens)
├── icon-512-maskable.png  (512x512, safe zone padding)
└── apple-touch-icon.png   (180x180, iOS)
```

Design: Simple "B" or dollar sign on blue (#3b82f6) background.

## HTML Integration

Add to `src/app.html` `<head>`:

```html
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="theme-color" content="#3b82f6">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
```

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `static/manifest.json` | PWA manifest |
| `static/icons/*.png` | App icons (4 files) |
| `src/service-worker.ts` | Cache management |

### Modified Files

| File | Changes |
|------|---------|
| `src/app.html` | Manifest link, meta tags |

## Testing Plan

1. Build and preview: `npm run build && npm run preview`
2. Chrome DevTools → Application tab:
   - Manifest loads correctly
   - Service worker registered
   - Cache populated
3. Lighthouse PWA audit — should pass all checks
4. Android device test: Chrome menu → "Install app"
5. Test offline: enable airplane mode, verify app works

## Future Enhancements (Out of Scope)

- Push notifications for recurring transactions
- Background sync for cloud backup
- Custom install prompt UI
- Workbox for advanced caching strategies

## Deployment

No changes to GitHub Pages workflow. Static files deploy as-is. HTTPS provided by GitHub Pages.
