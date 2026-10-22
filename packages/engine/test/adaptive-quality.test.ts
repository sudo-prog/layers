import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AdaptiveQuality } from "../src/adaptive-quality.js";

describe("AdaptiveQuality", () => {
  let aq: AdaptiveQuality;

  beforeEach(() => {
    vi.useFakeTimers();
    aq = new AdaptiveQuality({
      lowFpsThreshold: 30,
      lowFpsDuration: 2,
      highFpsThreshold: 45,
      highFpsDuration: 5,
      minScale: 0.5,
      maxScale: 1.0,
      scaleStep: 0.25,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at max scale (1.0)", () => {
    expect(aq.scale).toBe(1.0);
  });

  it("does not change scale when FPS is healthy", () => {
    // Feed 60 fps for 10 seconds
    for (let i = 0; i < 600; i++) {
      aq.frame(1 / 60);
      vi.advanceTimersByTime(16.67);
    }
    expect(aq.scale).toBe(1.0);
  });

  it("steps down scale after sustained low FPS", () => {
    // Feed 20 fps for 3 seconds (below 30 fps threshold for >2s)
    for (let i = 0; i < 60; i++) {
      aq.frame(1 / 20); // 20 fps = 50ms per frame
      vi.advanceTimersByTime(50);
    }
    expect(aq.scale).toBe(0.75);
  });

  it("steps down to minimum scale after prolonged low FPS", () => {
    // Feed 15 fps for 10 seconds
    for (let i = 0; i < 150; i++) {
      aq.frame(1 / 15);
      vi.advanceTimersByTime(66.67);
    }
    expect(aq.scale).toBe(0.5);
  });

  it("does not go below min scale", () => {
    // Feed extremely low fps for a very long time
    for (let i = 0; i < 500; i++) {
      aq.frame(1 / 5);
      vi.advanceTimersByTime(200);
    }
    expect(aq.scale).toBe(0.5);
  });

  it("steps back up after sustained high FPS", () => {
    // First drop to 0.5
    for (let i = 0; i < 150; i++) {
      aq.frame(1 / 15);
      vi.advanceTimersByTime(66.67);
    }
    expect(aq.scale).toBe(0.5);

    // Now feed 60 fps for 6 seconds (above 45 fps threshold for >5s)
    for (let i = 0; i < 360; i++) {
      aq.frame(1 / 60);
      vi.advanceTimersByTime(16.67);
    }
    expect(aq.scale).toBe(0.75);
  });

  it("returns to max scale after prolonged high FPS", () => {
    // Drop to 0.5 first
    for (let i = 0; i < 150; i++) {
      aq.frame(1 / 15);
      vi.advanceTimersByTime(66.67);
    }
    expect(aq.scale).toBe(0.5);

    // Feed 60 fps for 12 seconds — should step up twice
    for (let i = 0; i < 720; i++) {
      aq.frame(1 / 60);
      vi.advanceTimersByTime(16.67);
    }
    expect(aq.scale).toBe(1.0);
  });

  it("does not step up prematurely — requires sustained high FPS", () => {
    // Drop to 0.75
    for (let i = 0; i < 60; i++) {
      aq.frame(1 / 20);
      vi.advanceTimersByTime(50);
    }
    expect(aq.scale).toBe(0.75);

    // Feed high fps for only 3 seconds (less than 5s threshold)
    for (let i = 0; i < 180; i++) {
      aq.frame(1 / 60);
      vi.advanceTimersByTime(16.67);
    }
    // Should still be 0.75 — hasn't been sustained long enough
    expect(aq.scale).toBe(0.75);
  });

  it("does not step down prematurely — requires sustained low FPS", () => {
    // Feed low fps for only 1 second (less than 2s threshold)
    for (let i = 0; i < 20; i++) {
      aq.frame(1 / 20);
      vi.advanceTimersByTime(50);
    }
    // Should still be 1.0
    expect(aq.scale).toBe(1.0);
  });

  it("reports current fps correctly", () => {
    // Feed exactly 30 fps
    for (let i = 0; i < 10; i++) {
      aq.frame(1 / 30);
      vi.advanceTimersByTime(33.33);
    }
    expect(aq.currentFps).toBeGreaterThan(29);
    expect(aq.currentFps).toBeLessThan(31);
  });

  it("reports isLowQuality flag correctly", () => {
    // Initially false
    expect(aq.isLowQuality).toBe(false);

    // Drop below threshold
    for (let i = 0; i < 150; i++) {
      aq.frame(1 / 15);
      vi.advanceTimersByTime(66.67);
    }
    expect(aq.isLowQuality).toBe(true);
  });

  it("resets correctly", () => {
    // Drop to 0.5
    for (let i = 0; i < 150; i++) {
      aq.frame(1 / 15);
      vi.advanceTimersByTime(66.67);
    }
    expect(aq.scale).toBe(0.5);

    aq.reset();
    expect(aq.scale).toBe(1.0);
    expect(aq.currentFps).toBe(0);
    expect(aq.isLowQuality).toBe(false);
  });

  it("emits onScaleChange callback when scale changes", () => {
    const onChange = vi.fn();
    aq.onScaleChange = onChange;

    // Trigger a step down
    for (let i = 0; i < 60; i++) {
      aq.frame(1 / 20);
      vi.advanceTimersByTime(50);
    }

    expect(onChange).toHaveBeenCalledWith(0.75, 1.0);
  });

  it("does not emit onScaleChange when scale stays the same", () => {
    const onChange = vi.fn();
    aq.onScaleChange = onChange;

    // Feed healthy fps — no change
    for (let i = 0; i < 100; i++) {
      aq.frame(1 / 60);
      vi.advanceTimersByTime(16.67);
    }

    expect(onChange).not.toHaveBeenCalled();
  });
});
