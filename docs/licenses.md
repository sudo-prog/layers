# License Register

> Generated from the OpenSource reference, `package.json` files, `pnpm-lock.yaml`, and `node_modules` verification.  
> Status as of 2026-10-07.

## Summary

| Verdict | Count |
|---------|-------|
| ✅ OK | 17 |
| ⚠️ WARNING | 8 |
| 🚫 BLOCKED | 1 |

**Policy:** The client bundle must not contain AGPL/SSPL/PolyForm/non-commercial dependencies. All third-party code is vendored into `third_party/<name>/` with LICENSE, NOTICE, URL, and commit hash, wrapped behind internal interfaces.

---

## Package Dependencies

### Production Dependencies

| Package | Version | License | Source URL | Verdict | Notes |
|---------|---------|---------|------------|---------|-------|
| `ajv` | 8.20.0 | MIT | https://github.com/ajv-validator/ajv | ✅ OK | Schema validation for `@layers/schema` |
| `ajv-formats` | 3.0.1 | MIT | https://github.com/ajv-validator/ajv-formats | ✅ OK | Additional formats for AJV (IETF, URI, etc.) |

### Tooling / Dev Dependencies

> All tooling deps (Playwright, Vitest, etc.) are marked OK per project policy.

| Package | Version | License | Source URL | Verdict | Notes |
|---------|---------|---------|------------|---------|-------|
| `turbo` | 2.11.7 | MIT | https://github.com/vercel/turborepo | ✅ OK | Build orchestrator |
| `typescript` | 5.9.3 | Apache-2.0 | https://github.com/microsoft/TypeScript | ✅ OK | Type compiler |
| `@types/node` | 22.20.5 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | ✅ OK | Node.js type definitions |
| `vitest` | 2.1.9 | MIT | https://github.com/vitest-dev/vitest | ✅ OK | Testing framework |
| `jsdom` | 30.1.2 | MIT | https://github.com/jsdom/jsdom | ✅ OK | DOM environment for browser-API unit tests (`@layers/engine`, `@layers/cores`, `@layers/ui`) |
| `esbuild` | 0.21.5 | MIT | https://github.com/evanw/esbuild | ✅ OK | Bundler (transitive, used by Vite/Vitest) |
| `vite` | 5.4.21 | MIT | https://github.com/vitejs/vite | ✅ OK | Build tool (transitive, used by Vitest) |

### OpenSource Reference Entries (Not in package.json — Under Review / Inspiration Only)

> Sourced from `OpenSource.md`. These are candidate dependencies not yet in the actual `package.json` or `pnpm-lock.yaml`.

| Package | License | Use | Source URL | Verdict | Notes |
|---------|---------|-----|------------|---------|-------|
| `paper-design/shaders` | Apache-2.0 (>=v0.0.77) | Dithering, paper-texture, fluted-glass, water shaders | https://github.com/paper-design/shaders | ✅ OK | Pin exact version >= 0.0.77. Was PolyForm Shield 0.0.47–0.0.76 — those versions are BLOCKED. |
| `phoboslab/WebGLImageFilter` | MIT (verified) | Color matrix, convolution, blur kernels | https://github.com/phoboslab/WebGLImageFilter | ✅ OK | Port to internal pass interface |
| `evanw/glfx.js` | MIT (believed) | Swirl, bulge, unsharp, vignette | https://github.com/evanw/glfx.js | ⚠️ WARNING | Must confirm before import — WebGL1, port to GLSL ES 3.0 |
| `mat-sz/fxGlue` | Confirm | GLSL partial includes, program groups | https://github.com/mat-sz/fxGlue | ⚠️ WARNING | License unconfirmed — study for pass fusion only |
| `ashima/webgl-noise` | MIT (believed) | Simplex/classic noise | https://github.com/ashima/webgl-noise | ⚠️ WARNING | License unconfirmed — used in cores 2 and 4 |
| `viliusle/miniPaint` | MIT (verified) | Magic wand, flood fill, brush/eraser logic | https://github.com/viliusle/miniPaint | ✅ OK | Canvas2D tools only, not renderer |
| `igorski/bitmappery` | Confirm | Layer caching, worker offload patterns | https://github.com/igorski/bitmappery | ⚠️ WARNING | License unconfirmed — patterns, not code |
| `GraphiteEditor/Graphite` | Apache-2.0 (verified) | Node-graph concepts | https://github.com/GraphiteEditor/Graphite | ✅ OK | Rust/WASM too heavy; no branding |
| `Openshop` | Could not confirm | Inspiration only | Unknown | ⚠️ WARNING | Do not plan reuse — repo/license unconfirmed |
| `@immich/sdk` | AGPL-3.0 (server-reported) | Immich client | https://github.com/immich-app/immich | 🚫 BLOCKED | Client over HTTP; confirm SDK license or generate own client |
| `isomorphic-git` | MIT (believed) | In-browser git | https://github.com/isomorphic-git/isomorphic-git | ⚠️ WARNING | License unconfirmed — Octokit first |
| `Optuna` | Apache-2.0 | AI pipeline | https://github.com/optuna/optuna | ✅ OK | Python optimization framework |
| `pycma` | BSD-3-Clause | AI pipeline | https://github.com/CMA-ES/pycma | ✅ OK | Covariance Matrix Adaptation |
| `open_clip` | MIT | AI pipeline | https://github.com/mlfoundations/open_clip | ✅ OK | OpenCLIP model |
| `LPIPS` | BSD-2-Clause | AI pipeline | https://github.com/richzhang/PerceptualSimilarity | ✅ OK | Learned perceptual image patch similarity |
| `OpenCV` | Apache-2.0 | AI pipeline | https://github.com/opencv/opencv | ✅ OK | Computer vision library |
| `scikit-image` | BSD-3-Clause | AI pipeline | https://github.com/scikit-image/scikit-image | ✅ OK | Image processing |
| `FastAPI` | MIT | AI pipeline | https://github.com/tiangolo/fastapi | ✅ OK | Web framework for APIs |
| `pgvector` | PostgreSQL License | AI pipeline | https://github.com/pgvector/pgvector | ✅ OK | Vector similarity in PostgreSQL |
| `Playwright` | Apache-2.0 | Tooling (testing) | https://github.com/microsoft/playwright | ✅ OK | Browser automation |
| `pixelmatch` | MIT | Tooling (testing) | https://github.com/mapbox/pixelmatch | ✅ OK | Pixel-level image diff |
| `Lighthouse CI` | Apache-2.0 | Tooling (CI) | https://github.com/treosh/lighthouse-ci | ✅ OK | Lighthouse auditing |
| `axe-core` | MPL-2.0 | Tooling (accessibility) | https://github.com/dequelabs/axe-core | ⚠️ WARNING | MPL-2.0 source disclosure — OK for dev tooling only, NOT in client bundle |
| `Workbox` | MIT | Tooling (PWA) | https://github.com/apache/workbox | ✅ OK | Service worker tooling |
| `Zustand` | MIT | State management | https://github.com/pmndrs/zustand | ✅ OK | Client state library |
| `Octokit` | MIT (believed) | GitHub API client | https://github.com/octokit/octokit | ⚠️ WARNING | License unconfirmed — preferred over isomorphic-git |
| `three` | 0.186.1 | MIT | https://github.com/mrdoob/three.js | ✅ OK | WebGL/WebGPU renderer + TSL (Three.js Shading Language). TSL lives in `src/nodes/` within the same package — MIT license verified from `LICENSE` file on master branch. Node-based shader graph compiles to GLSL/WGSL. 0 dependencies. Lazy-load outside 150 KB engine bundle. **Bundle: 719 kB minified / 180.6 kB gzip**; tree-shakeable via `three/examples` (node-based TSL API). |
| `paper.js` | 0.12.18 | MIT | https://github.com/paperjs/paper.js | ✅ OK | "Swiss Army Knife of Vector Graphics Scripting" — Canvas2D-based vector graphics. MIT confirmed from npm registry. **Bundle: 232.3 kB minified / 82.2 kB gzip.** No ES6 module exports (not tree-shakeable); lazy-load only. No dependencies. |
| `gsap` | 3.15.0 | Custom (Standard No-Charge) | https://github.com/greensock/GSAP | ✅ OK | **License is NOT MIT** — it's Webflow's "Standard No-Charge GSAP License" (effective 2025-04-30, replacing GreenSock's custom license post-acquisition). Free for commercial projects including all formerly Club-only plugins (SplitText, MorphSVG, etc.). **Restriction:** Prohibited Uses = visual animation builders that compete with Webflow. LAYERS is a visual design tool — potential conflict. **Recommendation:** ✅ OK for now (FAQ explicitly says AI tools generating GSAP code are fine), but if LAYERS ships a visual animation builder, get explicit written confirmation from Webflow/GreenSock. Lazy-load only. **Bundle: 69 kB minified / 26.7 kB gzip**; tree-shakeable, side-effect free. 0 dependencies. |
| `penpot` | — | MPL-2.0 (client) / AGPL-3.0 (server) | https://github.com/penpot/penpot | ⚠️ WARNING | Reference only per Brief-Rev2 line 16 ("Penpot secondary"). NOT for code reuse. Server is AGPL-3.0; client UI is MPL-2.0. If integration via HTTP API is needed, MPL-2.0 only requires source disclosure of modified MPL files — acceptable for reference/inspiration. Do not vendor client code into the bundle. |

**Rev-2 bundle impact:** Per Brief-Rev2 line 17 (R-40), all four new deps are lazy-loaded outside the 150 KB engine bundle. Only `three` and `gsap` are tree-shakeable (side-effect free); `paper.js` is not (no ESM exports). `penpot` is reference-only (no bundle inclusion).

### pnpm-lock.yaml Warnings

- No deprecation warnings found in `pnpm-lock.yaml`.
- No license-related warnings in lockfile metadata.
- All resolved versions match expected sources.

---

## License Abbreviations Reference

| License | Category |
|---------|----------|
| MIT | ✅ OK |
| BSD-2-Clause, BSD-3-Clause | ✅ OK |
| Apache-2.0 | ✅ OK |
| ISC | ✅ OK |
| Unlicense, CC0 | ✅ OK |
| Public Domain | ✅ OK |
| MPL-2.0 | ⚠️ WARNING (source disclosure) |
| PolyForm (Shield, etc.) | 🚫 BLOCKED |
| AGPL-3.0 | 🚫 BLOCKED |
| SSPL | 🚫 BLOCKED |
| Non-commercial (CC-BY-NC, etc.) | 🚫 BLOCKED |

---

## Policy Reference

From `OpenSource.md`:

> **Policy:** Vendor into `third_party/<name>/` with LICENSE, NOTICE, URL, commit hash; wrap behind our interfaces; CI fails on AGPL/SSPL/PolyForm/non-commercial in client bundle.
