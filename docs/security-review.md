# LAYERS Security Review

**Date:** 2026-10-14
**Scope:** Token/auth handling, CSP, SSRF, input validation, transport security
**Methodology:** Static code review of all files listed in the review scope

---

## Executive Summary

| Area | Severity | Status |
|------|----------|--------|
| Token storage & handling | **Medium** | Issue found |
| Client-side token exposure | **Medium** | Issue found |
| Content Security Policy | **High** | **FIXED** — CSP headers added to index.html + vite.config.ts |
| SSRF (URL import) | **None** | Not applicable — no URL fetching found |
| Auth on AI service endpoints | **Medium** | **FIXED** — Bearer token middleware added (skips /v1/health) |
| Input validation | **Low** | Minor gaps |
| Anonymization strength | **Medium** | Weak salt — **OPEN** |
| GitHub token exposure | **Medium** | **FIXED** — `public readonly token` → `private readonly _token` + getter |

---

## 1. Token & Auth Handling

### 1.1 Immich API Key (`packages/sync/src/immich.ts`)

**Finding:** The `apiKey` is stored as a `private` class member (good) and transmitted via the `x-api-key` header (standard practice). It is never logged directly in code.

**Concern:** The `ImmichClient` constructor requires the caller to pass the API key. If this package is ever imported into frontend code (e.g., for direct browser-to-Immich communication), the API key would be exposed in the browser's memory and JavaScript devtools. The package's use of `fetch` means it *could* run in a browser environment.

**Risk:** Medium — depends on deployment architecture. If the sync layer runs server-side or in Node.js, this is acceptable.

### 1.2 GitHub PAT (`packages/sync/src/index.ts`)

**Finding:** The `token` is declared as `public readonly token: string` (line 89). This means any code holding a reference to the `GitHubSyncProvider` instance can read the token directly.

**Risk:** Medium — the comment on line 83 says "The token is never logged or exposed," but the `public` visibility contradicts this. If this provider is used in any context where the object is inspectable (browser, shared memory, serialization), the token is accessible.

**Recommendation:** Change to `private readonly` to match the Immich client pattern.

### 1.3 AI Service Authentication (`services/ai/app/main.py`)

**Finding:** The FastAPI service has **no authentication middleware whatsoever**. All endpoints (`/v1/features/extract`, `/v1/jobs`, `/v1/images/upload`, `/v1/images/{image_id}`, `/v1/stacks/*`, `/v1/events/*`, `/v1/dashboard/acceptance`, `/v1/retrieve`) are fully open.

**Mitigating factor:** The service binds to `127.0.0.1:8123` (line 276), making it localhost-only in the default configuration. The Vite dev server proxies `/v1` requests to this port.

**Risk:** Medium — if the service is ever bound to `0.0.0.0` or exposed to a network, all endpoints are unauthenticated. There is also no rate limiting, making the service vulnerable to resource exhaustion (especially the feature extraction endpoints which run compute-heavy pipelines).

---

## 2. Content Security Policy (CSP)

### 2.1 `apps/web/index.html`

**Finding:** No CSP meta tag is present. The `<head>` contains no `<meta http-equiv="Content-Security-Policy">` directive.

### 2.2 `apps/web/vite.config.ts`

**Finding:** No CSP configuration. The Vite config sets up the dev server proxy, PWA manifest, and Workbox runtime caching, but does not configure CSP headers (either via `server.headers` or via the PWA plugin's header options).

### 2.3 PWA Manifest

**Finding:** The manifest (configured in `vite.config.ts`) is a standard web app manifest. It does not include a `content_security_policy` field (which is not a standard manifest field anyway).

**Risk:** High — without CSP, the application is vulnerable to:
- Cross-Site Scripting (XSS) via injected scripts
- Data exfiltration via unauthorized network requests
- Clickjacking (no `frame-ancestors` directive)
- Mixed content injection

---

## 3. SSRF (Server-Side Request Forgery)

### 3.1 `apps/web/src/imageImport.ts`

**Finding:** This module does **not** fetch arbitrary user-provided URLs. It exclusively uses:
- `<input type="file">` for file selection (lines 36–42)
- `createImageBitmap(file)` for decoding (line 107)
- `Image` + `URL.createObjectURL(file)` as a fallback (lines 113–128)

All operations work on local `File` objects obtained from the device's file picker or camera. There are no `fetch()` calls to user-supplied URLs.

**Risk:** None — SSRF is not applicable to this file.

### 3.2 Other URL fetching

The only URL-fetching code in the frontend is in `aiClient.ts`, which calls the local AI service via relative paths (`/v1/...`). The Immich client in `packages/sync/src/immich.ts` fetches from a configured `serverUrl`, but this is a package-level concern, not a direct SSRF vector from user input in the web app.

---

## 4. Input Validation

### 4.1 Image Upload (`services/ai/app/main.py`, line 237–250)

**Finding:** The `/v1/images/upload` endpoint accepts any file extension and content. There is no MIME type validation, magic-byte checking, or file size limit. The stored path uses the original file extension.

**Risk:** Low — the service is localhost-only and the image processing pipeline (`preprocess_image`) would fail gracefully on non-image files. However, arbitrary file uploads to the server filesystem are a concern if the service is ever exposed.

### 4.2 Image Retrieval (`services/ai/app/main.py`, line 253–260)

**Finding:** The `/v1/images/{image_id}` endpoint matches files by `path.stem == image_id`. Since `image_id` is a UUID generated by the server, path traversal is not possible.

**Risk:** None — UUID-based lookup is safe.

### 4.3 Event Metadata

**Finding:** The `Event.metadata` field (`services/ai/app/events.py`, line 98) accepts arbitrary JSON. There is no schema validation on metadata content. The frontend's `emitEvent` function (`apps/web/src/eventEmitter.ts`) passes unvalidated payloads.

**Risk:** Low — the data is stored locally, but if the metadata were to contain PII, it would be persisted without sanitization.

---

## 5. Anonymization & Data Protection

### 5.1 Hardcoded Anonymization Salt

**Finding:** Both `services/ai/app/events.py` (line 37) and `services/ai/app/consent.py` use a fixed salt:

```python
_ANON_SALT: str = "layers-anon-v1"
```

This salt is hardcoded in the source code. Anyone with access to the repository can reverse SHA-256 hashes if they know or guess the raw user IDs.

**Risk:** Medium — SHA-256 with a known salt provides obfuscation, not true anonymization. For a local-first application where the user ID is typically a device identifier, the entropy is low and brute-force reversal is feasible.

### 5.2 Session IDs

**Finding:** Events include a `session_id` field described as "opaque session identifier." If session IDs are derived from user identifiers or timestamps, they could leak information.

**Risk:** Low — depends on how session IDs are generated on the frontend (not reviewed in this scope).

---

## Summary of Recommendations

| # | Priority | Finding | Recommendation |
|---|----------|---------|----------------|
| 1 | High | No CSP anywhere | **FIXED** — CSP headers added to index.html meta + vite.config.ts server.headers |
| 2 | Medium | No auth on AI service | **FIXED** — Bearer token middleware added (skips /v1/health) |
| 3 | Medium | `public readonly token` | **FIXED** — Changed to `private readonly _token` + getter |
| 4 | Medium | Hardcoded anonymization salt | **OPEN** — Source salt from environment variable or secrets manager |
| 5 | Medium | Immich client could run in browser | **OPEN** — Document that `packages/sync` is server-side only |
| 6 | Low | No file type validation on upload | **OPEN** — Add MIME type and magic-byte validation for image uploads |
| 7 | Low | No rate limiting | **OPEN** — Add rate limiting for compute-intensive endpoints |

---

*This review covers static analysis only. Dynamic testing (penetration testing, fuzzing) is recommended for a complete security assessment.*
