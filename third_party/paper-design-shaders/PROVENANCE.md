# Provenance: @paper-design/shaders

| Field | Value |
|---|---|
| **Package** | `@paper-design/shaders` |
| **Version** | `0.0.81` |
| **License** | Apache-2.0 |
| **Source URL** | https://github.com/paper-design/shaders |
| **Registry** | https://registry.npmjs.org/@paper-design/shaders/-/shaders-0.0.81.tgz |
| **Integrity** | `sha512-jeGdyjMscZ2bxmQdo8lhwUufHUf4iq3s1ayjh8PXU7Go42Rw8E3I0It1FZdc3HuWt5J82m//DRWaxsRqRfA4Gg==` |
| **Shasum** | `6cc8f87a7bcdcfa76f8134192ed460dbc9b60e6d` |
| **Vendored on** | 2026-10-09 |

## What we use

| Our core | Paper Shaders source | Extracted GLSL |
|---|---|---|
| `pattern-dither` | `dist/shaders/dithering.js` | Bayer 2×2/4×4/8×8 matrices, `getBayerValue()`, simplex-noise + dots + wave shape generators |
| `noise-grain` | `dist/shader-utils.js` | `simplexNoise` (snoise/permute), `proceduralHash11/21/22`, `declarePI`, `rotation2` |

## How it's adapted

The Paper Shaders GLSL is extracted **verbatim** into
`packages/cores/src/_vendored_*.glsl` / inlined into the core `.ts` files. Our
adaptation is limited to:

1. **Uniform mapping** — our engine-neutral names (`uScale`, `uAngle`,
   `uShape`, `uDitherType`, `uContrast`) are wired onto Paper's shader logic.
2. **Input source** — our cores sample the previous pass output (`uTexture`)
   and use its luminance as the dither coverage driver; Paper's originals
   generate their field procedurally from time.
3. **Pass interface** — output written as `fragColor` with our `uOpacity` /
   `uMask` contract.

The core algorithms (Bayer dithering, simplex noise, the shape generators) are
unmodified Paper Shaders code.

## NOTICE requirement (Apache-2.0 §4)

The upstream `NOTICE` file is preserved at
`third_party/paper-design-shaders/package/NOTICE` and must be reproduced in any
distribution that includes this vendored code:

```
Paper Shaders
Copyright 2026 Paper

Powered by Paper Shaders:
https://shaders.paper.design
```

## License gate

Apache-2.0 is on the CI allow-list (`docs/licenses.md`). This entry satisfies
the license-check cross-reference. No AGPL/SSPL/PolyForm/non-commercial code is
vendored.
