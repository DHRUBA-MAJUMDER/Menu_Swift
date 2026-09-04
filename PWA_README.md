# MenuSwift PWA conversion

This version keeps the existing MenuSwift website and Firebase/backend flow, while adding installable Progressive Web App support.

## Start page
`https://www.menuswift.in/admin-login`

## Added
- `manifest.webmanifest` with `/admin-login` as the app start URL
- `sw.js` service worker
- Offline fallback page
- 192x192, 512x512 and Apple touch icons
- PWA metadata on all HTML pages
- Vercel headers for service-worker updates and manifest content type

## Important behavior
- HTML/admin pages use network-first behavior and are **not cached as offline copies**.
- `/api/*` calls are never cached.
- Cross-origin Firebase/CDN requests are never intercepted.
- Static same-origin images/CSS/JS can be cached for faster app loading.

## Deploy
Deploy this folder to the same Vercel project/domain. HTTPS is required for installation outside localhost.

## Install on Android
Open `https://www.menuswift.in/admin-login` in Chrome, then use **Install app** / **Add to Home screen**. Once installed, it opens in standalone app mode.
