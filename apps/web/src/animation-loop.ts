import { getEnabledItems, estimatePasses, isMobileOk } from "@layers/stack";
import { state } from "./app-state";
import { passCount, fpsDisplay } from "./dom-refs";
import { tickDrivers } from "./dynamicLoop";

// Frame time hook — set by initLoop to receive per-frame timing deltas.
let onFrameHook: ((deltaMs: number) => void) | null = null;

export function setFrameHook(cb: ((deltaMs: number) => void) | null): void {
  onFrameHook = cb;
}

// Internal: call the hook after each render frame.
function emitFrameHook(deltaMs: number): void {
  if (onFrameHook) {
    try {
      onFrameHook(deltaMs);
    } catch {
      // Never let a hook crash the render loop.
    }
  }
}

export function updateFps(): void {
  state.frameCount++;
  const now = performance.now();
  const elapsed = now - state.lastFpsTime;
  if (elapsed >= 1000) {
    state.fpsValue = Math.round((state.frameCount * 1000) / elapsed);
    fpsDisplay.textContent = `${state.fpsValue} fps`;
    state.frameCount = 0;
    state.lastFpsTime = now;
  }
}

export function renderFrame(): void {
  if (!state.renderer) return;

  // Resolve driven props ONCE per frame, before anything draws, so every core
  // sees the same frame's values. Doing this per item would advance smoothing
  // and momentum state once per layer instead of once per frame.
  tickDrivers(16.7);

  // If context is lost, don't render but still update UI
  if (state.renderer.context.isLost) {
    // Still update pass count for UI consistency
    const enabled = getEnabledItems(state.stack);
    const passes = estimatePasses(enabled);
    passCount.textContent = `${passes} passes`;
    if (!isMobileOk(passes)) {
      passCount.style.color = "var(--error)";
    } else {
      passCount.style.color = "var(--text-tertiary)";
    }
    return;
  }

  state.renderer.render(0);

  // Update pass count
  const enabled = getEnabledItems(state.stack);
  const passes = estimatePasses(enabled);
  passCount.textContent = `${passes} passes`;
  if (!isMobileOk(passes)) {
    passCount.style.color = "var(--error)";
  } else {
    passCount.style.color = "var(--text-tertiary)";
  }
}

export function startLoop(): void {
  let lastTime = performance.now();
  function loop(): void {
    const now = performance.now();
    const delta = now - lastTime;
    lastTime = now;
    renderFrame();
    updateFps();
    emitFrameHook(delta);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
