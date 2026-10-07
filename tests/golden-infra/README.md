# Golden Image Infrastructure

## Purpose
Deterministic headless rendering + golden-image comparison for CI.
Used by T-BE-008 (Stage 0.7) to validate shader stacks render identically across environments.

## Architecture
```
fixtures/           # Golden reference images (committed)
  bevel-emboss/
    golden.png      # Reference render
    stack.json      # Effect stack that produced it
    meta.json       # Render params (resolution, seed, etc.)
  gradient/
    ...
scripts/
  render.js         # Headless render script (Playwright + Chromium)
  compare.js        # Image comparison (SSIM, pixelmatch)
  run-all.js        # Run all golden tests
output/             # Generated test results (gitignored)
  diff/
  report.json
```

## Requirements
- Headless WebGL2 rendering in CI (ubuntu-latest, no display)
- Deterministic output (same input → same image, ±1% tolerance)
- SSIM >= 0.98 for deterministic cores, >= 0.90 for stochastic (fixed seed)
- Performance: < 5s per 1024x1024 render

## Metrics
- **SSIM** (Structural Similarity) — primary metric
- **pixelmatch** — pixel-level diff
- **LPIPS** — learned perceptual similarity (Phase 1)
- **Palette distance** — color histogram comparison
- **Edge SSIM** — edge-aware comparison
- **Frequency distance** — FFT-based comparison

## Usage
```bash
# Render all fixtures
node tests/golden-infra/scripts/run-all.js

# Render single fixture
node tests/golden-infra/scripts/render.js fixtures/bevel-emboss/stack.json

# Compare rendered vs golden
node tests/golden-infra/scripts/compare.js output/bevel-embress.png fixtures/bevel-emboss/golden.png
```

## CI Integration
```yaml
- name: Golden image tests
  run: |
    npm install -g playwright
    npx playwright install chromium --with-deps
    node tests/golden-infra/scripts/run-all.js
```

## Status
- [ ] Headless renderer (Playwright + Chromium + SwiftShader)
- [ ] Golden fixtures (40 style sets + 20 held-out content images)
- [ ] Comparison pipeline (SSIM + pixelmatch)
- [ ] CI integration
- [ ] Performance benchmarking
- [ ] Documentation

## References
- [[03-Reference/Gates]] — Quality gates
- [[01-Roadmap/S-0.7]] — Stage 0.7 spec
- [[03-Reference/Cores]] — 7 shader cores
- ADR-012 — Graphite strategy (reference-only)
