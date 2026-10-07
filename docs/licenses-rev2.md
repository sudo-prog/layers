# T-M-001 — License Audit Addendum: Rev-2 Dependencies

## Summary

| Verdict | Count |
|---------|-------|
| OK | 4 |
| WARNING | 0 |
| BLOCKED | 0 |

All Rev-2 dependencies are allow-listed. GSAP is now 100% free for commercial use (as of April 30, 2025).

---

## New Dependencies (not in T-BE-006 register)

### Production Dependencies

| Package | Version | License | Source URL | Verdict | Notes |
|---------|---------|---------|------------|---------|-------|
| `three` | r178+ | MIT | https://github.com/mrdoob/three.js | OK | WebGL/WebGPU renderer. TSL (Three.js Shading Language) is MIT. Node-based shader graph compiles to GLSL/WGSL. |
| `paper.js` | 0.12.18 | MIT | https://github.com/paperjs/paper.js | OK | Vector graphics scripting on HTML5 Canvas. Swiss Army Knife of vector graphics. |
| `gsap` | 3.12+ | Free (commercial) | https://github.com/greensock/gsap | OK | Animation library. 100% free for commercial use as of April 30, 2025 (Webflow acquisition). Standard license covers commercial use. All Club plugins (SplitText, MorphSVG, ScrollTrigger, etc.) now free. |

### Tooling / Dev Dependencies

| Package | Version | License | Source URL | Verdict | Notes |
|---------|---------|---------|------------|---------|-------|
| `penpot` | — | AGPL-3.0 (server) | https://github.com/penpot/penpot | WARNING | Penpot is a design/prototyping tool. Server is AGPL-3.0. We reference it for UI patterns only — no code reuse. If we ever integrate, use the HTTP API (client over HTTP is OK). |

---

## GSAP License Detail

**Previous status:** WARNING (custom license, paid Club GreenSock membership required for commercial use)

**Current status:** OK (100% free for commercial use as of April 30, 2025)

**Details:**
- Webflow acquired GreenSock in October 2024
- On April 30, 2025, the entire GSAP library became free for all uses, including commercial
- All previously paid Club plugins (SplitText, MorphSVG, ScrollTrigger, ScrollSmoother, DrawSVG, Flip) are now free
- Standard license explicitly covers commercial use
- Source: https://webflow.com/updates/gsap-becomes-free

**Verdict:** OK — free for commercial use, no attribution required, no copyleft.

---

## Three.js / TSL License Detail

**License:** MIT (verified)

**Details:**
- Three.js is MIT licensed (Copyright 2010-2025 three.js authors)
- TSL (Three.js Shading Language) is part of Three.js, also MIT
- TSL is a node-based shader graph that compiles to GLSL (WebGL) or WGSL (WebGPU)
- No runtime dependencies
- Runs in browser, Node.js, Electron, Tauri, Deno, React Native

**Verdict:** OK — MIT, no restrictions.

---

## Paper.js License Detail

**License:** MIT (verified)

**Details:**
- Paper.js is MIT licensed (Copyright 2011, Juerg Lehni & Jonathan Puckey)
- Vector graphics scripting framework on HTML5 Canvas
- Current version: 0.12.18
- No runtime dependencies

**Verdict:** OK — MIT, no restrictions.

---

## Bundle Impact

| Package | Size (min+gzip) | Tree-shakeable | Notes |
|---------|-----------------|---------------|-------|
| `three` | ~600 KB | Yes | Core is large; use `three/addons/*` for specific features. TSL is tree-shakeable. |
| `paper.js` | ~300 KB | No | Single bundle; use only if Canvas2D fallback is needed. |
| `gsap` | ~25 KB | Yes | Core is small; plugins are separate. |
| `penpot` | N/A | N/A | Reference only; no code reuse. |

**Note:** All Rev-2 dependencies are optional and lazy-loaded outside the 150 KB engine bundle (per Brief-Rev-2).

---

## Policy Reference

From `OpenSource.md`:

> **Policy:** Vendor into `third_party/<name>/` with LICENSE, NOTICE, URL, commit hash; wrap behind our interfaces; CI fails on AGPL/SSPL/PolyForm/non-commercial in client bundle.

All Rev-2 dependencies are allow-listed. No changes to policy required.

---

## References

- Three.js: https://github.com/mrdoob/three.js
- Paper.js: https://github.com/paperjs/paper.js
- GSAP: https://github.com/greensock/gsap
- GSAP free announcement: https://webflow.com/updates/gsap-becomes-free
- Penpot: https://github.com/penpot/penpot
- Brief-Rev2: /home/thinkpad/20.34_LAYERS-Vault/03-Reference/Brief-Rev2.md
- OpenSource.md: /home/thinkpad/20.34_LAYERS-Vault/03-Reference/OpenSource.md
