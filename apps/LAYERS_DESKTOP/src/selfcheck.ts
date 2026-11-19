/**
 * Geometry self-check, run inside the page.
 *
 * Loaded only when the URL has `?selfcheck=1`, so it never ships behaviour to a
 * real user. It measures the frame and toolbar against the visible canvas and
 * writes the result to `document.body.dataset.geometry`, which a test harness can
 * assert on without needing to evaluate JS itself.
 *
 * Why this exists: the Hermes browser harness times out evaluating JS on this
 * page (a 1920x1080 WebGL canvas with a continuous rAF loop starves its 5s
 * Runtime.evaluate budget). Putting the measurement in the app means any harness
 * that can read an attribute can verify the layout.
 */

export interface GeometryResult {
  ok: boolean;
  width: number;
  visibleCanvas: { l: number; r: number; w: number };
  frame: { l: number; r: number; t: number; b: number };
  frameInsideVisible: boolean;
  frameInsideVertically: boolean;
  barPastViewport: boolean;
  barOverlapsPanel: boolean;
  truncated: string[];
  bodyHScroll: number;
  zoom: string | null;
}

export function runSelfCheck(): GeometryResult {
  const q = (s: string) => document.querySelector(s);
  const rect = (el: Element | null) => {
    if (!el) return { l: 0, r: 0, t: 0, b: 0 };
    const r = el.getBoundingClientRect();
    return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) };
  };

  const cs = getComputedStyle(document.documentElement);
  const ca = rect(q(".canvas-card") || q(".canvas-area"));
  const frame = rect(q("#frame"));
  const bar = rect(q(".insert-bar"));

  // New layout: the canvas card/window IS the visible canvas region.
  // Old layout: .canvas-area was full-bleed with panels overlaid, so the
  // visible strip was clientWidth minus panel widths. Detect by presence.
  const hasCard = !!q(".canvas-card");
  let visibleCanvas: { l: number; r: number; w: number };
  if (hasCard) {
    visibleCanvas = { l: ca.l, r: ca.r, w: ca.r - ca.l };
  } else {
    const pl = parseFloat(cs.getPropertyValue("--panel-left-w")) || 0;
    const pr = parseFloat(cs.getPropertyValue("--panel-right-w")) || 0;
    visibleCanvas = { l: ca.l + pl, r: ca.r - pr, w: ca.r - pr - (ca.l + pl) };
  }

  const truncated: string[] = [];
  const walk = (n: Element) => {
    // Skip `sr-only` nodes: they are 1px wide BY DESIGN, so `scrollWidth >
    // clientWidth` is always true and they would report as false positives.
    if (n.classList?.contains("sr-only")) return;
    if (n.children.length === 0 && (n.textContent ?? "").trim()) {
      if (n.scrollWidth - n.clientWidth > 1) truncated.push((n.textContent ?? "").trim().slice(0, 24));
    }
    for (const c of Array.from(n.children)) walk(c);
  };
  walk(document.body);

  const frameInsideVisible = frame.l >= visibleCanvas.l - 1 && frame.r <= visibleCanvas.r + 1;
  const frameInsideVertically = frame.t >= ca.t - 1 && frame.b <= ca.b + 1;
  const barPastViewport = bar.l < -0.5 || bar.r > window.innerWidth + 0.5;
  const barOverlapsPanel = bar.l < visibleCanvas.l - 0.5 || bar.r > visibleCanvas.r + 0.5;
  const bodyHScroll = document.documentElement.scrollWidth - window.innerWidth;

  const ok =
    frameInsideVisible &&
    frameInsideVertically &&
    !barPastViewport &&
    !barOverlapsPanel &&
    truncated.length === 0 &&
    bodyHScroll <= 0;

  return {
    ok,
    width: window.innerWidth,
    visibleCanvas,
    frame,
    frameInsideVisible,
    frameInsideVertically,
    barPastViewport,
    barOverlapsPanel,
    truncated,
    bodyHScroll,
    zoom: q("#zoom-level")?.textContent ?? null,
  };
}

/**
 * Write the self-check result to `document.body.dataset.geometry` (JSON) and a
 * human-readable summary to `#selfcheck` so it is visible in the a11y tree.
 */
export function publishSelfCheck(): GeometryResult {
  const r = runSelfCheck();
  document.body.dataset.geometry = JSON.stringify(r);

  let el = document.getElementById("selfcheck");
  if (!el) {
    el = document.createElement("div");
    el.id = "selfcheck";
    // Deliberately NOT `sr-only`: Maestro's accessibility-tree dump truncates and
    // drops visually-hidden nodes, so an `sr-only` result node was invisible to
    // the flow. It is positioned off to the side but rendered, so it is in the
    // tree, and it only exists under `?selfcheck=1`.
    el.style.cssText =
      "position:fixed;left:-9999px;top:0;padding:4px 8px;" +
      "font:11px ui-monospace,monospace;color:#0f0;background:#000;z-index:9999;" +
      "white-space:nowrap;pointer-events:none";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  // A short, assertable summary. Maestro can `assertVisible` on this text.
  el.textContent = r.ok
    ? `geometry-ok frame ${r.frame.l},${r.frame.r} visible ${r.visibleCanvas.l},${r.visibleCanvas.r}`
    : `geometry-FAIL frame ${r.frame.l},${r.frame.r} visible ${r.visibleCanvas.l},${r.visibleCanvas.r} ` +
      `truncated=${r.truncated.join("|")} hscroll=${r.bodyHScroll}`;
  return r;
}
