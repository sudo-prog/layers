/**
 * LAYERS Debug Session Recorder
 *
 * Gated by `?debug=1` query param. Captures device info, performance metrics,
 * render events, errors, and PWA status for hardware smoke test analysis.
 *
 * Ring buffer caps at 2000 events. Sampler runs at 1Hz.
 * Export as JSON via the debug export button or programmatically.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DebugEvent {
  t: number; // ms since session start
  type: string;
  data: Record<string, unknown>;
}

export interface DebugSession {
  sessionId: string;
  startTime: number;
  device: DeviceInfo;
  events: DebugEvent[];
  samples: TimeSample[];
  summary: SessionSummary;
}

export interface DeviceInfo {
  userAgent: string;
  platform: string;
  language: string;
  screenWidth: number;
  screenHeight: number;
  dpr: number;
  deviceMemory?: number;
  hardwareConcurrency: number;
  maxTouchPoints: number;
  gpuRenderer: string;
  gpuVendor: string;
  webgl2: boolean;
  webgpu: boolean;
  webglVersion: string;
  webglRenderer: string;
  webglVendor: string;
  webglShadingLanguageVersion: string;
  prefersReducedMotion: boolean;
  prefersDark: boolean;
  onLine: boolean;
  cookieEnabled: boolean;
  serviceWorker: boolean;
  pwaInstalled: boolean;
  visibilityState: string;
}

export interface TimeSample {
  t: number; // ms since session start
  fps: number;
  frameTime: number;
  jsHeapUsed?: number;
  jsHeapTotal?: number;
  longTasks: number;
  passCount: number;
  activeCores: number;
  quality: number;
}

export interface SessionSummary {
  totalEvents: number;
  totalSamples: number;
  durationMs: number;
  avgFps: number;
  minFps: number;
  maxFps: number;
  p50FrameTime: number;
  p95FrameTime: number;
  p99FrameTime: number;
  maxHeapMB: number;
  longTaskCount: number;
  contextLossCount: number;
  errorCount: number;
  shaderCompileErrors: number;
  exportCount: number;
  exportTotalMs: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_EVENTS = 2000;
const SAMPLE_INTERVAL = 1000; // 1Hz

// ─── Session State ──────────────────────────────────────────────────────────

let session: DebugSession | null = null;
let samplerId: number | null = null;
let frameTimes: number[] = [];
let longTaskCount = 0;
let contextLossCount = 0;
let errorCount = 0;
let shaderCompileErrors = 0;
let exportCount = 0;
let exportTotalMs = 0;
let lastFrameTime = 0;
let fpsBuffer: number[] = [];

// ─── Helpers ────────────────────────────────────────────────────────────────

function getGpuInfo(): { renderer: string; vendor: string } {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return { renderer: "unknown", vendor: "unknown" };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (ext) {
      return {
        renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "unknown",
        vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || "unknown",
      };
    }
    return {
      renderer: gl.getParameter(gl.RENDERER) || "unknown",
      vendor: gl.getParameter(gl.VENDOR) || "unknown",
    };
  } catch {
    return { renderer: "unknown", vendor: "unknown" };
  }
}

function getWebglInfo(): { version: string; renderer: string; vendor: string; shadingLanguage: string } {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return { version: "none", renderer: "unknown", vendor: "unknown", shadingLanguage: "unknown" };
    return {
      version: gl instanceof WebGL2RenderingContext ? "2.0" : "1.0",
      renderer: gl.getParameter(gl.RENDERER) || "unknown",
      vendor: gl.getParameter(gl.VENDOR) || "unknown",
      shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION) || "unknown",
    };
  } catch {
    return { version: "error", renderer: "unknown", vendor: "unknown", shadingLanguage: "unknown" };
  }
}

function detectWebgpu(): boolean {
  return typeof (navigator as Record<string, unknown>).gpu === "object";
}

function isPwaInstalled(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
    || (window.navigator as unknown as Record<string, unknown>).standalone === true;
}

function getDeviceInfo(): DeviceInfo {
  const gpu = getGpuInfo();
  const webgl = getWebglInfo();
  const nav = navigator as Navigator & { deviceMemory?: number };

  return {
    userAgent: nav.userAgent,
    platform: nav.platform,
    language: nav.language,
    screenWidth: screen.width,
    screenHeight: screen.height,
    dpr: window.devicePixelRatio,
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency || 0,
    maxTouchPoints: nav.maxTouchPoints || 0,
    gpuRenderer: gpu.renderer,
    gpuVendor: gpu.vendor,
    webgl2: typeof WebGL2RenderingContext !== "undefined",
    webgpu: detectWebgpu(),
    webglVersion: webgl.version,
    webglRenderer: webgl.renderer,
    webglVendor: webgl.vendor,
    webglShadingLanguageVersion: webgl.shadingLanguage,
    prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    prefersDark: window.matchMedia("(prefers-color-scheme: dark)").matches,
    onLine: nav.onLine,
    cookieEnabled: nav.cookieEnabled,
    serviceWorker: "serviceWorker" in navigator,
    pwaInstalled: isPwaInstalled(),
    visibilityState: document.visibilityState,
  };
}

function generateSessionId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 12; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// ─── Event Recording ────────────────────────────────────────────────────────

function addEvent(type: string, data: Record<string, unknown> = {}): void {
  if (!session) return;
  const event: DebugEvent = {
    t: Date.now() - session.startTime,
    type,
    data,
  };
  session.events.push(event);
  if (session.events.length > MAX_EVENTS) {
    session.events.splice(0, session.events.length - MAX_EVENTS);
  }
  // Track counters
  if (type === "error") errorCount++;
  if (type === "shader_compile_error") shaderCompileErrors++;
  if (type === "context_lost") contextLossCount++;
  if (type === "export_complete") {
    exportCount++;
    exportTotalMs += (data.durationMs as number) || 0;
  }
}

// ─── Sampler ────────────────────────────────────────────────────────────────

function takeSample(passCount = 0, activeCores = 0, quality = 1): void {
  if (!session) return;
  const now = Date.now();
  const elapsed = now - session.startTime;

  // Calculate FPS from frame times buffer
  const recentFrames = frameTimes.filter((ft) => now - ft < SAMPLE_INTERVAL);
  const fps = recentFrames.length > 0 ? Math.round((recentFrames.length / SAMPLE_INTERVAL) * 1000) : 0;
  const avgFrameTime = recentFrames.length > 0
    ? recentFrames.reduce((a, b) => a + b, 0) / recentFrames.length
    : 0;

  // JS heap
  let jsHeapUsed: number | undefined;
  let jsHeapTotal: number | undefined;
  const perf = performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } };
  if (perf.memory) {
    jsHeapUsed = perf.memory.usedJSHeapSize;
    jsHeapTotal = perf.memory.totalJSHeapSize;
  }

  const sample: TimeSample = {
    t: elapsed,
    fps,
    frameTime: Math.round(avgFrameTime * 100) / 100,
    jsHeapUsed,
    jsHeapTotal,
    longTasks: longTaskCount,
    passCount,
    activeCores,
    quality,
  };
  session.samples.push(sample);
}

// ─── Frame Tracking ─────────────────────────────────────────────────────────

export function trackFrame(): void {
  const now = performance.now();
  if (lastFrameTime > 0) {
    frameTimes.push(now);
  }
  lastFrameTime = now;
}

export function trackLongTask(duration: number): void {
  longTaskCount++;
  addEvent("long_task", { durationMs: Math.round(duration) });
}

export function trackContextLost(): void {
  contextLossCount++;
  addEvent("context_lost", {});
}

export function trackError(message: string, stack?: string): void {
  addEvent("error", { message, stack });
}

export function trackShaderError(shaderName: string, error: string): void {
  shaderCompileErrors++;
  addEvent("shader_compile_error", { shaderName, error });
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function initDebugSession(): DebugSession | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get("debug") !== "1") return null;

  const device = getDeviceInfo();
  session = {
    sessionId: generateSessionId(),
    startTime: Date.now(),
    device,
    events: [],
    samples: [],
    summary: {
      totalEvents: 0,
      totalSamples: 0,
      durationMs: 0,
      avgFps: 0,
      minFps: Infinity,
      maxFps: 0,
      p50FrameTime: 0,
      p95FrameTime: 0,
      p99FrameTime: 0,
      maxHeapMB: 0,
      longTaskCount: 0,
      contextLossCount: 0,
      errorCount: 0,
      shaderCompileErrors: 0,
      exportCount: 0,
      exportTotalMs: 0,
    },
  };

  addEvent("session_start", { device });

  // Visibility changes
  document.addEventListener("visibilitychange", () => {
    addEvent("visibility_change", { state: document.visibilityState });
  });

  // Online/offline
  window.addEventListener("online", () => addEvent("network_online"));
  window.addEventListener("offline", () => addEvent("network_offline"));

  // Error handlers
  window.addEventListener("error", (e) => {
    trackError(e.message, e.error?.stack);
  });
  window.addEventListener("unhandledrejection", (e) => {
    trackError(`Unhandled rejection: ${e.reason}`);
  });

  // WebGL context lost
  const canvas = document.getElementById("gl-canvas") as HTMLCanvasElement | null;
  if (canvas) {
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      trackContextLost();
    });
    canvas.addEventListener("webglcontextrestored", () => {
      addEvent("context_restored");
    });
  }

  // Start sampler
  samplerId = window.setInterval(() => {
    takeSample();
  }, SAMPLE_INTERVAL);

  return session;
}

export function logDebugEvent(type: string, data?: Record<string, unknown>): void {
  addEvent(type, data ?? {});
}

export function getDebugSession(): DebugSession | null {
  return session;
}

export function isDebugEnabled(): boolean {
  return session !== null;
}

export function getSessionElapsed(): number {
  if (!session) return 0;
  return Date.now() - session.startTime;
}

// ─── Export ─────────────────────────────────────────────────────────────────

export function exportDebugSession(): DebugSession | null {
  if (!session) return null;

  // Stop sampler
  if (samplerId !== null) {
    clearInterval(samplerId);
    samplerId = null;
  }

  // Compute summary
  const duration = Date.now() - session.startTime;
  const fpsValues = session.samples.map((s) => s.fps).filter((f) => f > 0);
  const frameTimeValues = session.samples.map((s) => s.frameTime).filter((ft) => ft > 0);
  const heapValues = session.samples
    .map((s) => s.jsHeapUsed)
    .filter((h): h is number => h !== undefined);

  const sortedFps = [...fpsValues].sort((a, b) => a - b);
  const sortedFrameTimes = [...frameTimeValues].sort((a, b) => a - b);

  session.summary = {
    totalEvents: session.events.length,
    totalSamples: session.samples.length,
    durationMs: duration,
    avgFps: fpsValues.length > 0 ? Math.round(fpsValues.reduce((a, b) => a + b, 0) / fpsValues.length) : 0,
    minFps: sortedFps.length > 0 ? sortedFps[0] : 0,
    maxFps: sortedFps.length > 0 ? sortedFps[sortedFps.length - 1] : 0,
    p50FrameTime: percentile(sortedFrameTimes, 50),
    p95FrameTime: percentile(sortedFrameTimes, 95),
    p99FrameTime: percentile(sortedFrameTimes, 99),
    maxHeapMB: heapValues.length > 0 ? Math.round(Math.max(...heapValues) / 1024 / 1024 * 100) / 100 : 0,
    longTaskCount,
    contextLossCount,
    errorCount,
    shaderCompileErrors,
    exportCount,
    exportTotalMs,
  };

  addEvent("session_end", { durationMs: duration });

  return session;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] || 0;
}

export function downloadDebugSession(): void {
  const data = exportDebugSession();
  if (!data) return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `layers-debug-${data.sessionId}-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── UI ─────────────────────────────────────────────────────────────────────

export function injectDebugToolbar(): void {
  if (!session) return;

  const toolbar = document.querySelector(".toolbar-actions");
  if (!toolbar) return;

  const container = document.createElement("div");
  container.className = "debug-toolbar";
  container.style.cssText = "display:flex;align-items:center;gap:8px;margin-left:auto;padding:0 12px;";

  const sessionLabel = document.createElement("span");
  sessionLabel.style.cssText = "color:#4ade80;font-size:11px;font-family:monospace;";
  sessionLabel.textContent = `DEBUG ${session.sessionId}`;

  const elapsedLabel = document.createElement("span");
  elapsedLabel.style.cssText = "color:#94a3b8;font-size:11px;font-family:monospace;";
  const updateElapsed = () => {
    if (!session) return;
    const elapsed = Math.round((Date.now() - session.startTime) / 1000);
    elapsedLabel.textContent = `${elapsed}s`;
  };
  updateElapsed();
  setInterval(updateElapsed, 1000);

  const exportBtn = document.createElement("button");
  exportBtn.className = "btn";
  exportBtn.style.cssText = "font-size:11px;padding:2px 8px;";
  exportBtn.textContent = "Export Debug";
  exportBtn.addEventListener("click", () => {
    downloadDebugSession();
  });

  container.appendChild(sessionLabel);
  container.appendChild(elapsedLabel);
  container.appendChild(exportBtn);
  toolbar.appendChild(container);
}
