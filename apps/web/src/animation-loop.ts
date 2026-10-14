import { getEnabledItems, estimatePasses, isMobileOk } from "@layers/stack";
import { state } from "./app-state";
import { passCount, fpsDisplay } from "./dom-refs";

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
  function loop(): void {
    renderFrame();
    updateFps();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
