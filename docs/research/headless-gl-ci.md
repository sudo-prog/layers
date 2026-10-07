# Headless WebGL2 Rendering in CI — Research Summary

> **Recommendation (TL;DR):** Use **Playwright + Chromium (bundled) with SwiftShader software rendering**. It is the only approach that natively supports full WebGL2 + all 7 shader-core passes, works on `ubuntu-latest` without a display, captures screenshots via `locator.screenshot()`, and integrates with `pixelmatch` for deterministic comparison — all without native compilation dependencies. Use `--use-gl=angle --use-angle=swiftshader-webgl --enable-unsafe-swiftshader` flags.

---

## 1. headless-gl (npm package `gl`)

### What it is
`headless-gl` (npm: `gl`) creates a WebGL context in Node.js without a browser window. Built on ANGLE's OpenGL ES 2 implementation with an EGL interface. Passes the full Khronos ARB conformance suite for WebGL 1.0.3.

### WebGL2 support
**No.** Despite a long-standing issue (#109) requesting WebGL 2 support, the upstream `stackgl/headless-gl` package (the most widely used fork, maintained by Figma/descriptinc) only implements **WebGL 1.0.3**. There is an "experimental WebGL2 support" note in the README that references setting `createWebGL2Context: true` in context attributes, but ANGLE's ES 3.0 context creation path is incomplete and the feature is not functional for real-world use.

The LAYERS project uses GLSL ES 3.0 shaders across 7 cores (Pattern/Dither, Noise/Grain, Blur/Convolution, Displacement/Warp, Color/Palette/Blend, Lighting/Atmosphere, Outline/Edge). These require `textureLod`, `textureGrad`, multiple render targets, transform feedback, and other WebGL2-only features. **headless-gl cannot run them.**

### GitHub Actions CI (ubuntu-latest)
Yes — the project maintainers note it "should work out of the box on most CI systems," with explicit GitHub Actions examples in their CI workflow.

**Dependencies required:**
```bash
sudo apt-get install -y build-essential libxi-dev libglu1-mesa-dev libglew-dev pkg-config
```
On CI, if prebuilt binaries are unavailable for the runner architecture, it compiles a native addon (~30–60s build time).

### Framebuffer capture
Yes. You can attach a texture or renderbuffer to a framebuffer, render to it, and call `gl.readPixels()` to get a `Uint8Array`. This is the standard headless-gl workflow.

### Performance
Fast — no browser overhead. Direct native execution. But limited to whatever OpenGL ES 2.0 subset ANGLE's bundled translator supports.

### Limitations & known issues
- **WebGL 1 only** — cannot run GLSL ES 3.0 shader code.
- **Deprecated on macOS** since 2018 (OpenGL is deprecated; no Metal backend in the original ANGLE version bundled).
- **Native compilation** required on some platforms (adds CI setup complexity and potential for build failures across Node versions).
- **No `2d` canvas context** in headless-gl.
- **No `<canvas>` DOM** — you must manage framebuffers manually, making it incompatible with typical browser-based shader frameworks (three.js WebGL2Renderer, regl, etc.) that expect a DOM canvas.

### Verdict
**Not suitable for LAYERS.** The project's shader cores require WebGL2. headless-gl's WebGL 2 support is non-functional. Even if it worked, the lack of a DOM canvas means existing shader libraries would need to be ported.

---

## 2. Playwright + Chromium (with SwiftShader)

### What it is
Playwright bundles a patched Chromium build with its own browser binaries. It can launch Chromium in headless mode with software rendering via SwiftShader, requiring no physical GPU or display server.

### WebGL2 support
**Yes.** Chromium's SwiftShader software renderer fully supports WebGL2. SwiftShader implements OpenGL ES 3.0 (the basis for WebGL 2.0) in software on the CPU. Chromium routes WebGL through ANGLE + SwiftShader, providing the same WebGL2 API surface as hardware-accelerated Chrome.

### GitHub Actions CI (ubuntu-latest)
**Yes — this is the gold standard.** Playwright's `chromium` channel works on GitHub-hosted Ubuntu runners out of the box.

**Setup:**
```yaml
- name: Install Playwright
  run: |
    npx playwright install --with-deps chromium
```
No additional `apt-get` commands needed — Playwright installs all system dependencies automatically.

### Required flags for SwiftShader WebGL2
The critical flags force Chromium to use software rendering for WebGL:

```
--use-gl=angle
--use-angle=swiftshader-webgl
--enable-unsafe-swiftshader
--headless=new
--disable-dev-shm-usage
--no-sandbox
```

Per Chromium docs, the `--enable-unsafe-swiftshader` flag opts into the deprecated (but still supported) automatic fallback to SwiftShader for WebGL. Without it, newer Chromium versions will refuse to create WebGL contexts in headless mode.

### Framebuffer capture
**Yes, indirectly.** You don't manage framebuffers directly — instead, you call `page.screenshot()` or `locator.screenshot()` on the canvas element. Under the hood, Chromium renders to its compositor surface (which is backed by a framebuffer), and Playwright reads it back.

For more control, you can use `page.evaluate()` to call `canvas.toDataURL()` or `gl.readPixels()` from within the page context.

### Screenshot capture methods
```typescript
// Full page
await page.screenshot({ path: 'output.png' });

// Single canvas element (preferred for shader passes)
await page.locator('canvas#layers-canvas').screenshot({ path: 'pass.png' });

// Buffer for in-memory comparison
const buffer = await page.locator('canvas').screenshot();
// or via evaluate:
// const dataURL = await canvas.evaluate(c => c.toDataURL());
```

### Performance
- **Render time:** ~2–5 seconds for a 1024×1024 canvas with a typical shader stack, depending on shader complexity.
- **CPU-bound:** SwiftShader is a CPU rasterizer. Complex fragment shaders (e.g., noise/iteration-heavy) can be 5–20× slower than GPU.
- **Parallelizable:** Playwright contexts are isolated; multiple renders can run in parallel within a single browser instance.

### Deterministic rendering
SwiftShader produces **deterministic output** across runs on the same platform. This is because the CPU implementation has fixed floating-point behavior (no GPU-specific instruction reordering, no vendor-specific rounding). This is critical for golden-image testing.

### Dependencies
- `playwright` npm package (bundles Chromium)
- `@playwright/test` for test integration
- `pixelmatch` for pixel comparison

System deps installed via `--with-deps`: libx11, libnss3, libatk1.0, libatk-bridge2.0, libcups2, libdrm2, libxkbcommon0, libxcomposite1, libxdamage1, libxfixes3, libxrandr2, libgbm1, libasound2, libpango-1.0, libcairo2, etc. (all auto-managed by Playwright).

### Limitations & known issues
- **Slow for complex shaders** — CPU rasterization of 7-pass shader stacks can take 5–15s per render at 1024×1024.
- **No GPU acceleration** on `ubuntu-latest` runners (no GPU exposed). Hardware acceleration requires a custom runner with GPU access.
- **`--headless=new` required** for best WebGL fidelity; legacy headless has known WebGL bugs.
- **SwiftShader WebGL requires `--enable-unsafe-swiftshader`** — this is a security trade-off (noted as "not intended for running untrusted content" by Chromium docs) but acceptable for CI test rendering of your own shaders.
- **Memory:** Chrome's renderer process can consume significant RAM with large canvas backing stores; `--disable-dev-shm-usage` prevents `/dev/shm` exhaustion crashes in containers.

### Verdict
**Recommended for LAYERS.** Full WebGL2 support via SwiftShader, works on `ubuntu-latest`, deterministic output, excellent screenshot capture API, and integrates with existing Playwright-based test suites. The performance cost (CPU rasterization) is acceptable for CI golden-image testing at the project's required quality gates.

---

## 3. Puppeteer + Chromium (with SwiftShader)

### What it is
Puppeteer is a Node.js library that controls Chrome/Chromium over the DevTools Protocol. It bundles its own Chromium download or can use a system Chrome.

### WebGL2 support
**Yes.** Same Chromium engine as Playwright, so SwiftShader WebGL2 is fully supported. The underlying rendering is identical.

### GitHub Actions CI (ubuntu-latest)
**Yes.** Well-documented setup with `puppeteer` npm package.

**Setup:**
```yaml
- name: Install Chrome dependencies
  run: |
    sudo apt-get update
    sudo apt-get install -y \
      libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 \
      libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
      libxdamage1 libxfixes3 libxrandr2 libgbm1 \
      libasound2 libpango-1.0-0 libcairo2

- name: Install Puppeteer
  run: npx puppeteer browsers install chromium
```
Puppeteer does NOT auto-install system deps like Playwright does — you must manually list `apt` packages.

### Required flags
```
--no-sandbox
--disable-setid-sandbox
--use-gl=swiftshader             # Older syntax (legacy SwiftShader GL)
--use-gl=angle --use-angle=swiftshader  # Newer ANGLE + SwiftShader Vulkan
--enable-unsafe-swiftshader
--enable-webgl
--headless=new  (or headless: 'new')
--disable-dev-shm-usage
```

Note: Puppeteer's flag set is slightly different from Playwright's. The `--use-gl=swiftshader` flag is the legacy path; `--use-angle=swiftshader` is the modern path via ANGLE + SwiftShader Vulkan.

### Framebuffer capture
**Yes.** Same approach as Playwright:
```javascript
await page.setViewport({ width: 1024, height: 1024 });
const screenshot = await page.screenshot({ encoding: 'binary' });
```

### Performance
Identical to Playwright (same Chromium engine). CPU-bound software rasterization via SwiftShader.

### Deterministic rendering
**Yes.** SwiftShader produces deterministic output, same as with Playwright.

### Dependencies
- `puppeteer` npm package
- System-level Chromium dependencies (must be manually specified — this is a disadvantage vs Playwright)
- `pixelmatch` for comparison

### Limitations & known issues
- **No auto-dependency installation** — must manually specify system packages (error-prone, brittle across Ubuntu versions).
- **No auto-waiting** — Puppeteer doesn't auto-wait for page load like Playwright; you must add explicit `waitForSelector`/`waitForFunction` calls.
- **No built-in test runner** — Playwright has `@playwright/test`; Puppeteer is just a browser driver.
- **Known WebGL regression:** A reported issue (#14060) shows WebGL2 context creation failing in Puppeteer v24+ on some CI configurations, requiring the `--enable-unsafe-swiftshader` flag explicitly.
- **No network interception** — Playwright's request/response interception is more sophisticated for mocking network-dependent shader assets.

### Verdict
**Viable but inferior to Playwright for LAYERS.** The lack of auto-dependency management and built-in test runner makes it more brittle in CI. The golden-infra README already specifies Playwright, so switching to Playwright is the path of least resistance.

---

## 4. Node.js + `gl` package (headless-gl)

This is a duplicate of approach #1. The `gl` package IS headless-gl. See section 1 above.

**WebGL 1 only.** Cannot run LAYERS' GLSL ES 3.0 shaders. Not suitable.

---

## 5. Docker + Xvfb + Chromium

### What it is
Run a Docker container with Xvfb (X Virtual Framebuffer) providing a virtual display, then launch Chromium in headed mode inside that display. This simulates a desktop environment for GPU-enabled rendering.

### WebGL2 support
**Yes with caveats.** Chromium inside Xvfb can use Mesa's software rendering (llvmpipe) or a passthrough to the host GPU. However:

- **GPU passthrough to Docker:** Requires `--device=/dev/dri` and NVIDIA container toolkit + `--gpus all`. GitHub Actions runners do NOT expose GPUs, so this is not an option for `ubuntu-latest`.
- **Software rendering (llvmpipe):** Mesa's llvmpipe provides OpenGL 3.3+ via Gallium3D, which Chromium's ANGLE can use for WebGL2. This works but is slower than SwiftShader in some benchmarks.

### GitHub Actions CI (ubuntu-latest)
**Yes, but overkill.** You don't need Docker on GitHub Actions — you can install Chromium directly and use Playwright. Docker adds complexity (image building, layer caching in CI) for no benefit on a native runner.

However, Docker + Xvfb IS useful for **local development** or **self-hosted runners** where you want full isolation. The Docker image can be pre-built with all dependencies baked in, avoiding per-run `apt-get` overhead.

### Required setup
```dockerfile
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y \
    chromium \
    xvfb \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libasound2 libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# Run with virtual display
CMD ["xvfb-run", "--auto-servernum", "--server-args=-screen 0 1280x1280x24", \
     "node", "test-runner.js"]
```

Chromium launches without `--headless` flags (since Xvfb provides a display), using Mesa's llvmpipe for software rendering by default.

### Framebuffer capture
**Yes.** Standard `page.screenshot()` works because Chromium believes it has a real display.

### Performance
- **llvmpipe vs SwiftShader:** Mesa llvmpipe and SwiftShader are both CPU rasterizers. Reports vary: some benchmarks show llvmpipe ~20% faster, others show SwiftShader ~49% cheaper CPU. For shader-heavy workloads, results depend on the specific shader operations.
- **Startup overhead:** Xvfb adds ~0.5–1s startup time.
- **Memory:** Similar to headless Playwright.

### Deterministic rendering
**Yes, if you pin the Mesa/llvmpipe version.** Software rasterizers produce deterministic output for the same GL implementation. However, if you use GPU passthrough (not available on GitHub Actions), output becomes GPU-dependent and non-deterministic.

### Dependencies
Heavy — entire Docker image with OS packages, Chromium, Xvfb, and all GL libraries.

### Limitations & known issues
- **Overkill for CI** — Playwright bundles its own Chromium; Docker adds no value on GitHub Actions.
- **Image size** — Docker image is ~500MB–1GB due to Chromium + Mesa libs.
- **Layer caching** — If system deps change, entire layer must rebuild.
- **xvfb-run** must wrap the test command, adding complexity to test scripts.
- **Not headless** — Chromium runs in headed mode (within the virtual display), which means more processes, more memory, and slightly slower startup.

### Verdict
**Not recommended for LAYERS CI.** Use Playwright directly on `ubuntu-latest` instead. Docker+Xvfb is useful only for local development parity or self-hosted GPU runners.

---

## 6. WebGPU in CI (Dawn + SwiftShader)

### What it is
WebGPU is the next-generation graphics API for the web, successor to WebGL. Dawn is the reference implementation used by Chromium. SwiftShader provides a software Vulkan backend that Dawn can use.

### WebGL2 support
**No — this is a different API.** WebGPU is not WebGL2. The LAYERS project explicitly targets WebGL2 as the primary backend with WebGPU as a "future option." This research is therefore secondary to the main investigation.

### Headless WebGPU via Dawn
Yes, Dawn has a software backend (`dawn_native::vulkan::SwiftShaderVulkanBackend`) that runs without a GPU. The `@agent-browser` tool's documentation confirms this works in CI:

```bash
apt-get install -y libvulkan1 mesa-vulkan-drivers
```

Chromium flags for WebGPU through SwiftShader Vulkan:
```
--enable-unsafe-webgpu
--enable-features=Vulkan
--use-angle=vulkan
--use-vulkan=swiftshader
--use-webgpu-adapter=swiftshader
--disable-vulkan-surface
```

### GitHub Actions CI (ubuntu-latest)
**Possible but unstable for screenshots.** Research from the `agent-browser/webgpu` documentation reveals a critical limitation:

> **Linux headless captures black.** Headless Chrome with WebGPU renders correctly (rendering, eval-based pixel readbacks, and compute all work headless), but **headless capture returns a black image.** The workaround is to use `--headed` mode (which auto-starts Xvfb on display-less servers).

This means: you can verify that WebGPU rendering *executes without errors* headlessly, but you **cannot capture screenshots** for golden-image comparison without a virtual display.

### Performance
SwiftShader Vulkan is comparable to SwiftShader GL in performance. CPU-bound, no GPU acceleration on `ubuntu-latest`.

### Framebuffer capture
**Partial.** `readPixels()` via `device.queue.readBuffer()` works headlessly (the GPU work executes and returns correct pixel data). But `page.screenshot()` returns black in pure headless mode.

### Limitations & known issues
- **Not WebGL2** — different API, different shaders. Would require porting all 7 cores from GLSL ES 3.0 to WGSL.
- **Screenshot capture limitation** — headless WebGPU captures are black; requires Xvfb workaround.
- **Feature gaps** — WebGPU is still new; some WebGL2 features don't have direct WebGPU equivalents yet.
- **Tooling maturity** — fewer visual regression testing tools support WebGPU than WebGL2.
- **Chrome version dependency** — `--enable-unsafe-webgpu` flag is required because WebGPU is still experimental in some Chrome builds.

### Verdict
**Not ready for LAYERS v1.** The project targets WebGL2 first, WebGPU second. WebGPU headless screenshot capture is broken in pure headless mode. Focus on WebGL2 Playwright approach for now; revisit WebGPU when (a) the project ports shaders to WGSL, and (b) Chrome fixes headless screenshot capture for WebGPU.

---

## 7. Bonus: `@onirenaud/node-webgl` (Newer Node.js WebGL2)

### What it is
A newer npm package that provides headless WebGL 1 AND WebGL 2 for Node.js, backed by a current ANGLE build (the same engine Chrome uses).

### WebGL2 support
**Yes.** 100% of the WebGL2 IDL (225 methods, 559 constants) plus 52 extensions, all generated from current Khronos/ANGLE headers.

### GitHub Actions CI (ubuntu-latest)
**Yes.** Verified on GitHub's Ubuntu runners. Installs via `npm install @onirenaud/node-webgl`. On Linux, it compiles a small native addon (~10s) and uses system Mesa at runtime:

```bash
sudo apt-get install -y libegl1 libgles2 libgl1-mesa-dri
LIBGL_ALWAYS_SOFTWARE=1 node render.mjs
```

### Framebuffer capture
**Yes.** `gl.readPixels()` works, or `canvas.toDataURL()` if a canvas object is available.

### Performance
Hardware-accelerated if a GPU is available; falls back to Mesa llvmpipe or SwiftShader if not. On `ubuntu-latest` (no GPU), uses Mesa llvmpipe — comparable to SwiftShader.

### Limitations & known issues
- **Newer / less battle-tested** — fewer large-scale adoption reports than headless-gl or Playwright.
- **No prebuilt Linux binary** — compiles on install (though the build is fast, ~10s).
- **No `2d` canvas context** — same limitation as headless-gl.
- **No DOM** — you must manage the WebGL context directly, not through a browser's canvas element. This means you can't use browser-based shader frameworks directly; you'd need to write raw WebGL2 setup code in Node.
- **License:** MIT (confirmed on npm).

### Verdict
**Experimental alternative.** If the project wants a pure Node.js approach (no browser), this is the most viable WebGL2 option. However, it still requires writing WebGL2 context setup code manually (no shader framework compatibility). **Playwright remains better** because it can load and execute the exact same browser-based shader code that runs in production.

---

## Summary Table

| Approach | WebGL2 | CI (ubuntu-latest) | Framebuffer Capture | Dependencies | Determinism | Performance | Verdict |
|---|---|---|---|---|---|---|---|
| **headless-gl (`gl`)** | ❌ WebGL 1 only | ✅ Yes | ✅ Yes (`readPixels`) | `apt-get` + native build | ✅ Yes (ANGLE) | ⚡ Fast | ❌ Not suitable — WebGL1 only |
| **Playwright + Chromium + SwiftShader** | ✅ Full WebGL2 | ✅ Yes, auto-deps | ✅ `locator.screenshot()` | `npx playwright install` | ✅ Yes (SwiftShader CPU) | ⚠️ CPU-bound, ~2–5s/render | ✅ **Recommended** |
| **Puppeteer + Chromium + SwiftShader** | ✅ Full WebGL2 | ✅ Yes, manual deps | ✅ `page.screenshot()` | `npx puppeteer browsers install` + manual `apt-get` | ✅ Yes (SwiftShader) | ⚠️ CPU-bound, ~2–5s/render | ⚠️ Viable but inferior |
| **Docker + Xvfb + Chromium** | ✅ Full WebGL2 | ✅ Yes (overkill) | ✅ `page.screenshot()` | Docker image build + `apt-get` | ✅ Yes (llvmpipe) | ⚠️ CPU-bound, +Xvfb overhead | ❌ Overkill for CI |
| **WebGPU (Dawn + SwiftShader)** | ❌ Different API | ⚠️ Renders but **screenshots are black** in headless | ❌ (headless) / ✅ (headed+Xvfb) | `libvulkan1 mesa-vulkan-drivers` | ✅ Yes (SwiftShader) | ⚠️ CPU-bound | ❌ Not ready — WebGPU ≠ WebGL2 |
| **`@onirenaud/node-webgl`** | ✅ Full WebGL2 | ✅ Yes | ✅ `readPixels` | `apt-get` + native build (~10s) | ✅ Yes (ANGLE+llvmpipe) | ⚠️ CPU-bound | ⚠️ Experimental alternative |

---

## Image Comparison Methods

### 1. SSIM (Structural Similarity Index) — **Primary metric**
Measures perceptual similarity combining luminance, contrast, and structure. Range: [-1, 1], where 1 = identical.

- **Implementation:** `ssim` npm package or `fast-gaussian-sigma` + custom implementation
- **Threshold for LAYERS:** ≥ 0.98 for deterministic cores, ≥ 0.90 for stochastic (fixed seed)
- **Pros:** Correlates well with human perception, tolerant of minor GPU/driver differences
- **Cons:** Slower than pixelmatch, no diff image output by default
- **Use case:** Primary pass/fail gate

### 2. pixelmatch — **Pixel-level diff (secondary)**
Smallest, fastest JavaScript pixel-level comparison library (150 lines of code, no dependencies).

- **Implementation:** `pixelmatch` npm package (already in golden-infra `package.json`)
- **Usage:** `pixelmatch(img1, img2, diffBuffer, width, height, { threshold: 0.1 })`
- **Returns:** Number of differing pixels
- **Pros:** Blazing fast, tiny, generates diff images, anti-aliasing detection
- **Cons:** No perceptual weighting; sensitive to exact pixel values
- **Use case:** Secondary gate + diff visualization in CI reports

### 3. LPIPS (Learned Perceptual Image Patch Similarity) — **Future (Phase 1)**
Uses deep neural network features (AlexNet/VGG/SqueezeNet) to measure perceptual distance.

- **Implementation:** `torchmetrics` Python package with PyTorch + torchvision, or `lpips` Python package
- **Range:** [0, 1] (lower = more similar)
- **Interpretation:** < 0.1 = nearly identical, 0.1–0.3 = minor differences, 0.3–0.5 = clearly different
- **Pros:** Best human correlation, catches structural differences pixelmatch misses
- **Cons:** Requires Python + PyTorch (~500MB setup), much slower (~2–5s per comparison)
- **Use case:** Tertiary metric for edge-case detection; not needed for initial CI gate

### 4. looks-same — **Perceptual alternative to pixelmatch**
Human-perception-aware comparison with configurable ΔE (CIEDE2000) tolerance and anti-aliasing tolerance.

- **Implementation:** `looks-same` npm package
- **Pros:** Better than pixelmatch for anti-aliasing, configurable tolerance
- **Cons:** Slower than pixelmatch
- **Use case:** Alternative when pixelmatch produces too many false positives from anti-aliasing

### 5. Palette distance — **Color histogram comparison**
Compares color distributions across the image, insensitive to spatial layout.

- **Implementation:** Custom (compute histograms, compare with chi-squared or Earth Mover's Distance)
- **Use case:** Catching color-grading regressions that pixel-level diffs might miss due to spatial shifts

---

## Deterministic Rendering Pipeline Setup

For golden-image testing, the renderer must produce identical output for identical inputs. Here is the complete setup:

### Environment constraints (must be applied in CI)
```yaml
# GitHub Actions runner defaults
runs-on: ubuntu-latest
env:
  CI: true
```

### Chromium launch configuration (Playwright)
```typescript
import { chromium, type LaunchOptions } from '@playwright/test';

const launchOptions: LaunchOptions = {
  headless: true,
  args: [
    '--headless=new',                    // Modern headless mode
    '--use-gl=angle',                    // Route GL through ANGLE
    '--use-angle=swiftshader-webgl',       // SwiftShader for WebGL
    '--enable-unsafe-swiftshader',         // Opt-in to SwiftShader WebGL
    '--disable-dev-shm-usage',             // Prevent /dev/shm crashes
    '--no-sandbox',                      // Required in CI containers
    '--disable-setuid-sandbox',
    '--disable-gpu-sandbox',
    '--disable-software-rasterizer',     // Let SwiftShader handle GL
    '--disable-extensions',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-lookup-dict-learn-toplevel',
  ],
};
```

### Canvas setup for deterministic rendering
```typescript
// In the page context (evaluated via page.evaluate or injected script):
const canvas = document.createElement('canvas');
canvas.width = 1024;
canvas.height = 1024;
canvas.style.width = '1024px';
canvas.style.height = '1024px';

const gl = canvas.getContext('webgl2', {
  alpha: false,                          // No alpha channel — eliminates compositing nondeterminism
  depth: true,
  stencil: false,                        // Not needed for LAYERS passes
  antialias: false,                      // Disable MSAA — non-deterministic across drivers
  premultipliedAlpha: false,             // Keep raw pixel values
  preserveDrawingBuffer: true,           // Ensure readPixels gets the rendered content
  powerPreference: 'high-performance',   // Consistent across runs
  failIfMajorPerformanceCaveat: false,   // Allow software rendering
  desynchronized: false,                 // Synchronous canvas updates
});

// Verify context
if (!gl || !gl.getParameter(gl.VERSION)) {
  throw new Error('WebGL2 context not available');
}

// Verify SwiftShader
const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
if (debugInfo) {
  const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
  console.log('WebGL2 renderer:', renderer);
  // Expect: "ANGLE (SwiftShader ...)" on CI
}
```

### Render synchronization
```typescript
// Wait for rendering to complete before screenshot
async function waitForRenderComplete(gl, canvas, frameCount = 3) {
  // Submit multiple frames to ensure all passes have executed
  for (let i = 0; i < frameCount; i++) {
    // Render the full shader stack
    await page.evaluate(() => { window.layersRenderFrame(); });
    
    // Wait for GPU to flush
    gl.flush();
    
    // Wait for next animation frame (ensures compositor has presented)
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  
  // Double rAF pattern — ensures the last frame has been presented
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}

// Then capture
const screenshot = await canvasLocator.screenshot({ 
  animations: 'disabled',  // Freeze CSS animations
  timeout: 30000,
});
```

### Fixed viewport & DPR
```typescript
const context = await browser.newContext({
  viewport: { width: 1024, height: 1024 },
  deviceScaleFactor: 1,           // Pin DPR to 1
  locale: 'en-US',
  timezoneId: 'UTC',
  bypassCSP: false,               // Don't bypass CSP — keeps environment realistic
});
```

### Shader determinism considerations
- **GLSL ES 3.0 precision:** Set `precision highp float;` in all fragment shaders. SwiftShader uses IEEE 754 float consistently.
- **Texture filtering:** Use `NEAREST` filtering for pixel-exact lookups (no bilinear interpolation variance).
- **Noise functions:** Seed-based noise with `hash()` implementations that are deterministic across GLSL compilers.
- **Random functions:** Use a fixed PRNG (e.g., `fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453)`), not `noise()` built-ins.
- **Fragment shader loops:** Avoid non-deterministic loop counts; use fixed iteration counts.

---

## Recommended CI Workflow

```yaml
# .github/workflows/golden-images.yml
name: Golden Image Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  golden-images:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9.15.9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install Playwright
        run: npx playwright install --with-deps chromium

      - name: Run golden image tests
        run: |
          cd tests/golden-infra
          node scripts/run-all.js
        env:
          CI: true
          LAYERS_GOLDEN_MODE: render  # or compare

      - name: Upload diff images
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: golden-image-diffs
          path: tests/golden-infra/output/diff/

      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: golden-image-report
          path: tests/golden-infra/output/report.json
```

---

## Conclusion

For the LAYERS project's headless WebGL2 golden-image testing on `ubuntu-latest`:

1. **Primary approach: Playwright + Chromium + SwiftShader** — Full WebGL2 support, deterministic software rendering, auto-managed dependencies, excellent screenshot capture, and `pixelmatch`/`SSIM` integration. This is already the approach specified in the existing `golden-infra` README and `package.json`.

2. **Keep `headless-gl` as a future investigation** — If WebGL2 support lands in headless-gl or if `@onirenaud/node-webgl` proves stable, the pure-Node approach would eliminate browser overhead entirely. Not currently viable.

3. **Skip Docker+Xvfb for CI** — Unnecessary complexity on GitHub Actions. Useful only for local development parity.

4. **Defer WebGPU** — Not ready (screenshots are black in pure headless mode; also a different API from what LAYERS targets). Revisit when WebGPU becomes a priority and Chrome fixes headless capture.

5. **Image comparison pipeline:** `pixelmatch` (fast pixel-level) + `SSIM` (perceptual gate) + `looks-same` (anti-aliasing tolerant) → all already listed in the golden-infra `package.json` or as straightforward additions.
