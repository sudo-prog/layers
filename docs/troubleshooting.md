# LAYERS Troubleshooting Guide

**Last updated:** 2026-10-19

---

## Build & Dev Issues

### `pnpm dev` fails with "command not found"
- Ensure Node.js 20+ is installed: `node --version`
- Ensure pnpm is installed: `pnpm --version`
- Run `pnpm install` in the project root

### `pnpm build` fails
- Run `pnpm lint` to check for TypeScript errors
- Run `pnpm test` to verify all tests pass
- Check that all dependencies are installed: `pnpm install`

### Tests fail
- JS tests: `pnpm test` (Vitest, 447 tests)
- Python tests: `cd services/ai && python -m pytest` (257 tests)
- Golden images: `pnpm test:golden` (Playwright + Chromium)
- If tests fail after a pull, try `pnpm install` first

---

## Runtime Issues

### Blank page / app doesn't load
- Check browser console for errors (F12 → Console)
- Clear site data and reload (hard refresh: Ctrl+Shift+R)
- Ensure WebGL2 is supported: `chrome://gpu` → check "WebGL2"
- Try disabling browser extensions that may interfere

### WebGL context lost
- LAYERS has automatic context-loss recovery
- If the canvas goes black, wait a moment for recovery
- If persistent, reload the page

### Slow performance
- Reduce the number of cores in the stack (fewer passes = faster)
- Lower the image resolution
- Check the pass count indicator (green ≤ 8, yellow ≤ 11, red > 11)
- Close other browser tabs
- On mobile, disable unused cores

### Cores not rendering
- Ensure the core is toggled on (eye icon in stack panel)
- Check that all parameters are set to non-zero values
- Some cores (Lighting, Outline) require specific source imagery to be visible
- Try adjusting parameters — some defaults may be subtle

### Inspector sliders do nothing
- Ensure a core is selected in the stack panel
- Check that the core is toggled on
- Some parameters only affect certain modes (e.g., Lighting `blur` only affects shadow/glow)

---

## Sync Issues

### Presets not syncing
- Check sync status indicator in the footer
- Verify GitHub token is configured (if using GitHub sync)
- Verify Immich server URL and API key (if using Immich)
- Check network connectivity
- Syncthing: verify folder is connected on both devices

### Sync conflicts
- Conflict files are named `*.sync-conflict-*`
- Compare versions and merge manually
- After resolving, delete the conflict file
- The conflict detector in CI prevents committing conflict markers

---

## AI Service Issues

### AI endpoints return 401 Unauthorized
- The AI service requires a Bearer token
- Set `LAYERS_AI_TOKEN` environment variable
- The default dev token is "dev-token" (change for production)

### AI endpoints return 429 Too Many Requests
- Rate limit is 60 requests per minute per IP
- Wait a minute and retry
- The rate limiter is in-memory (resets on service restart)

### AI service won't start
- Check that port 8123 is not in use: `lsof -i :8123`
- Ensure Python 3.11+ is installed
- Install dependencies: `cd services/ai && pip install -r requirements.txt`
- Check the service logs for errors

### Feature extraction returns 413 (file too large)
- Maximum upload size is 50 MB
- Reduce image resolution before uploading
- The app auto-downscales to 1024px on import

### Feature extraction returns 415 (unsupported type)
- Allowed MIME types: image/jpeg, image/png, image/webp, image/gif
- Convert the image to a supported format

---

## PWA Issues

### Service worker not registering
- PWA only works in production build (`pnpm build && pnpm preview`)
- Dev mode does not register a service worker (by design)
- Check `chrome://serviceworker-internals` for status

### Offline mode not working
- Ensure the app was loaded at least once online (precache)
- Check that the service worker is active
- Clear site data and reload to re-precache

---

## Accessibility

### Keyboard navigation
- Tab through interactive elements
- Arrow keys navigate the stack panel
- Enter/Space activate selected elements
- Escape closes dialogs
- `?` shows the full keyboard shortcut overlay

### Reduced motion
- LAYERS respects `prefers-reduced-motion` media query
- Disable animations in your OS settings if needed

---

## Data & Privacy

### Clearing all data
- Clear site data in browser settings (removes localStorage + IndexedDB)
- Or use the in-app reset if available

### Exporting your data
- Export presets as JSON from the library panel
- Export the stack as JSON with `Ctrl+E` / `Cmd+E`
- Import with `Ctrl+D` / `Cmd+D`

### Consent management
- Open the Learning Store panel
- View and manage per-feature consent
- Revoke all consent at any time
- Consent state is stored in localStorage (per-origin)

---

## Getting Help

- Check the [README](../README.md) for project status
- Review the [Security Review](security-review.md) and [Privacy Review](privacy-review.md)
- Open a GitHub issue for bug reports
- Check the [Launch Checklist](launch-checklist.md) for known deferred items
