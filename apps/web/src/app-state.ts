import { createStackState, type StackState } from "@layers/stack";
import type { Renderer } from "@layers/engine";

export const state = {
  stack: createStackState(),
  renderer: null as Renderer | null,
  sourceCanvas: null as HTMLCanvasElement | null,
  preIsolateStack: null as StackState | null,
  theme: "light" as "light" | "dark",
  undoStack: [] as StackState[],
  redoStack: [] as StackState[],
  frameCount: 0,
  lastFpsTime: performance.now(),
  fpsValue: 0,
  stackSignatureCache: "",
  isPainting: false,
  lastPaintX: 0,
  lastPaintY: 0,
  contextLostBanner: null as HTMLDivElement | null,
};
