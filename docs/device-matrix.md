# LAYERS Device Matrix Template

**Stage:** 2.3 — Performance & reliability  
**Purpose:** Track device coverage for the ≥30 fps @ 1024–1536px gate

## Target Devices

| # | Device | Type | OS | Screen | GPU | Status |
|---|--------|------|----|--------|-----|--------|
| 1 | iPhone 13 | Phone | iOS 16+ | 1170×2532 | Apple A15 | ⬜ Not tested |
| 2 | iPhone 15 Pro | Phone | iOS 17+ | 1179×2556 | Apple A17 | ⬜ Not tested |
| 3 | Pixel 7 | Phone | Android 13+ | 1080×2400 | Mali-G710 | ⬜ Not tested |
| 4 | **iPad Pro (M1)** | **Tablet** | **iPadOS 16+** | **2388×1668** | **Apple M1 (8-core GPU)** | ⬜ Not tested — **PRIORITY: primary GPU test** |
| 5 | MacBook Air Intel | Laptop | macOS 12+ | 2560×1600 | Intel Iris Xe (8 GB RAM) | ⬜ Not tested — WebKit/Safari testing |
| 6 | MacBook Pro 14" M2 | Laptop | macOS 13+ | 3024×1964 | Apple M2 | ⬜ Not tested |
| 7 | ThinkPad X1 Carbon | Laptop | Linux/Windows | 1920×1080 | Intel Iris Xe | ⬜ Not tested — headless soak test |

## Test Priority (revised 2026-10-19)

1. **iPad Pro M1** — Real mobile GPU, real WebKit, real PWA install. Primary device for the ≥30 fps @ 1536px gate.
2. **MacBook Air Intel** — Safari/WebKit engine testing, 8 GB RAM constraint testing, PWA in standalone mode.
3. **ThinkPad (Linux)** — Headless soak test, CPU baseline, Chromium on Linux.

## Test Procedure

For each device:

1. **Install PWA** — Add to Home Screen
2. **Cold start** — Measure time from tap to first paint
3. **8-pass stack** — Build a stack with all 7 cores
4. **FPS measurement** — Use the built-in FPS display (readPixels-synced)
5. **Memory** — Monitor via platform tools (Activity Monitor, etc.)
6. **Thermal** — Check for thermal throttling after 5 min
7. **Soak** — Run for 60 min, check for memory leaks

## Budget

| Metric | Target | Pass/Fail |
|--------|--------|-----------|
| FPS (8 passes, max resolution) | ≥ 30 fps | ⬜ |
| Cold start | < 2.5 s | ⬜ |
| GPU memory | < 256 MB | ⬜ |
| Export 12 MP | < 6 s | ⬜ |
| Soak (60 min) | No crash, no mem leak | ⬜ |

## Notes

- The Stage 0.2 gate requires 8-pass stack ≥ 30 fps @ 1536px on a reference phone
- The current SwiftShader benchmark is a CPU-rasterisation lower bound, not real GPU performance
- WebGPU parity is behind a flag; default renderer is WebGL2
