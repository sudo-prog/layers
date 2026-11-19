/**
 * LAYERS Desktop — entry point.
 *
 * The full-canvas shader editor: a shader tree, a layer stack, a full-bleed
 * canvas window the panels sit behind, and a props panel. Multiple shaders
 * coexist as frames, which is the desktop surface's whole reason for existing
 * next to the mobile prototype.
 */

import { Editor, DIMENSIONS } from "./editor.js";
import { CORE_DEFS, CATEGORIES, type CoreDef, type CategoryId } from "./cores.js";
import { renderInspector } from "./propsPanel.js";
import { initPicker, openPicker, closePicker, isOpen } from "./picker.js";
import { iconSvg } from "./icons.js";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null;

// ── Zoom ────────────────────────────────────────────────────────────────────

let zoom = 1;

function applyZoom(next: number): void {
  zoom = Math.max(0.05, Math.min(4, next));
  const frame = $("frame");
  const doc = editor?.active;
  if (frame && doc) {
    // Size the frame from the document, then scale it. Relying on the canvas's
    // CSS width alone is circular — the frame needs an intrinsic size.
    frame.style.width = `${doc.width}px`;
    frame.style.height = `${doc.height}px`;
    frame.style.transform = `scale(${zoom})`;
  }
  const readout = $("zoom-level");
  if (readout) readout.textContent = `${Math.round(zoom * 100)}%`;
}

/** Fit the active frame inside the visible canvas viewport. */
function zoomToFit(): void {
  const doc = editor?.active;
  const viewport = $("canvas-viewport");
  if (!doc || !viewport) return;

  const pad = 64;
  const visibleW = viewport.clientWidth - pad * 2;
  const visibleH = viewport.clientHeight - pad * 2;
  if (visibleW <= 0 || visibleH <= 0) return;

  applyZoom(Math.min(visibleW / doc.width, visibleH / doc.height, 1));
}

// ── Render loop ─────────────────────────────────────────────────────────────

let editor: Editor | null = null;
let frameCount = 0;
let lastFps = performance.now();

function loop(): void {
  if (!editor) return;
  editor.render();

  frameCount += 1;
  const now = performance.now();
  if (now - lastFps >= 1000) {
    const fps = Math.round((frameCount * 1000) / (now - lastFps));
    const el = $("footer-fps");
    if (el) el.textContent = `${fps} fps`;
    frameCount = 0;
    lastFps = now;
  }

  const pc = $("footer-passes");
  if (pc && editor) pc.textContent = `${editor.passCount()} passes`;

  requestAnimationFrame(loop);
}

// ── UI render ───────────────────────────────────────────────────────────────

function renderShaderList(): void {
  const host = $("shader-list");
  if (!host || !editor) return;
  host.innerHTML = "";

  for (const s of editor.project.shaders) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "tree-row" + (s.id === editor.project.activeId ? " is-active" : "");
    row.setAttribute("aria-pressed", String(s.id === editor.project.activeId));
    row.innerHTML = `<span class="tree-row-icon">${iconSvg("layers", 14)}</span><span class="tree-row-name">${s.name}</span>`;
    row.addEventListener("click", () => {
      editor?.setActiveShader(s.id);
      renderAll();
    });
    host.appendChild(row);
  }

  const add = document.createElement("button");
  add.type = "button";
  add.className = "tree-row";
  add.setAttribute("aria-label", "Add shader");
  add.innerHTML = `<span class="tree-row-icon">${iconSvg("plus", 14)}</span><span class="tree-row-name">Add shader</span>`;
  add.addEventListener("click", () => {
    editor?.addShader();
    renderAll();
  });
  host.appendChild(add);
}

function renderLayerList(): void {
  const host = $("stack-list");
  if (!host || !editor) return;
  host.innerHTML = "";

  const doc = editor.active;
  if (!doc || !doc.stack.items.length) {
    const p = document.createElement("p");
    p.className = "tree-empty";
    p.textContent = "No layers. Add a component from the toolbar below the canvas.";
    host.appendChild(p);
    return;
  }

  for (const item of doc.stack.items) {
    const def = CORE_DEFS.find((d) => d.name === item.core);
    const row = document.createElement("button");
    row.type = "button";
    row.className =
      "tree-row" +
      (item.id === doc.stack.selectedId ? " is-active" : "") +
      (item.enabled ? "" : " is-hidden");
    row.setAttribute("aria-pressed", String(item.id === doc.stack.selectedId));
    row.innerHTML =
      `<span class="tree-row-icon">${iconSvg(def?.category ?? "layers", 14)}</span>` +
      `<span class="tree-row-name">${def?.label ?? item.core}</span>`;

    const actions = document.createElement("span");
    actions.className = "tree-row-actions";
    const eye = document.createElement("span");
    eye.className = "tree-row-flag";
    eye.setAttribute("role", "img");
    eye.setAttribute("aria-label", item.enabled ? "Visible" : "Hidden");
    eye.innerHTML = iconSvg(item.enabled ? "eye" : "eyeOff", 13);
    actions.appendChild(eye);
    row.appendChild(actions);

    row.addEventListener("click", () => {
      editor?.selectItem(item.id);
      renderAll();
    });
    host.appendChild(row);
  }
}

function renderProps(): void {
  const host = $("props-panel");
  if (!host || !editor) return;
  const doc = editor.active;
  renderInspector(host, doc?.stack.items ?? [], doc?.stack.selectedId ?? null, {
    setParam: (id, key, value) => {
      if (key === "__opacity") {
        editor?.setOpacity(id, Number(value));
        return;
      }
      if (key === "__blend") {
        editor?.setBlend(id, String(value));
        return;
      }
      editor?.setParam(id, key, value);
    },
    moveItem: (id, dir) => {
      editor?.moveItem(id, dir);
      renderAll();
    },
    removeItem: (id) => {
      editor?.removeItem(id);
      renderAll();
    },
    toggleItem: (id) => {
      editor?.toggleItem(id);
      renderAll();
    },
  });
}

function renderAll(): void {
  renderShaderList();
  renderLayerList();
  renderProps();
  const doc = editor?.active;
  if (doc) {
    const dl = $("dims-label");
    if (dl) dl.textContent = `${doc.width} × ${doc.height}`;
    const cm = $("canvas-meta");
    if (cm) cm.textContent = `Canvas · ${doc.width} × ${doc.height}`;
  }
}

// ── Toolbar ─────────────────────────────────────────────────────────────────

function mountInsertBar(): void {
  const host = $("insert-host");
  if (!host) return;
  host.innerHTML = "";
  const bar = document.createElement("div");
  bar.className = "insert-bar";
  bar.id = "insert-bar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Add component");

  for (const cat of CATEGORIES) {
    const n = CORE_DEFS.filter((c) => c.category === cat.id).length;
    if (!n) continue;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "insert-btn";
    b.title = `${cat.label} — ${n} ${n === 1 ? "component" : "components"}`;
    b.setAttribute("aria-label", `${cat.label}, ${n} components`);
    b.innerHTML =
      `${iconSvg(cat.id, 14)}` +
      `<span class="insert-btn-label">${cat.label}</span>`;
    b.addEventListener("click", () => openPicker(cat.id as CategoryId));
    bar.appendChild(b);
  }

  host.appendChild(bar);
}

function mountTopbar(): void {
  $("zoom-in")?.addEventListener("click", () => applyZoom(zoom * 1.25));
  $("zoom-out")?.addEventListener("click", () => applyZoom(zoom / 1.25));
  $("zoom-fit")?.addEventListener("click", zoomToFit);

  const themeBtn = $("toggle-theme");
  const syncThemeIcon = () => {
    const dark = document.documentElement.getAttribute("data-theme") !== "light";
    if (themeBtn) {
      themeBtn.innerHTML = iconSvg(dark ? "sun" : "moon", 14);
      themeBtn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
      themeBtn.title = dark ? "Switch to light theme" : "Switch to dark theme";
    }
  };
  themeBtn?.addEventListener("click", () => {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    syncThemeIcon();
  });
  syncThemeIcon();

  const proj = $("btn-project");
  proj?.addEventListener("click", () => {
    if (!editor) return;
    const next = prompt("Project name", editor.project.name);
    if (next && next.trim()) {
      editor.project.name = next.trim();
      proj.textContent = next.trim();
    }
  });

  // Pipeline label/button — keep interactive hook alive.
  $("btn-pipeline")?.addEventListener("click", () => {
    // No-op toggle point preserved for future wiring; label remains accurate.
  });

  $("btn-dims")?.addEventListener("click", () => toggleDimsMenu());
}

// ── Shell controls (rails, radius, nav modes) ───────────────────────────────

function setRailCollapsed(side: "left" | "right", collapsed: boolean): void {
  const rail = $(`rail-${side}`);
  const card = $("canvas-card");
  if (!rail || !card) return;
  rail.classList.toggle("is-collapsed", collapsed);
  card.classList.toggle(`nav-${side}`, collapsed);
  rail.querySelectorAll<HTMLElement>(".collapse-btn").forEach((b) => {
    b.setAttribute("aria-expanded", String(!collapsed));
    b.setAttribute("title", collapsed ? "Expand panel" : "Collapse panel");
  });
}

function mountShellControls(): void {
  // Per-rail collapse buttons
  document.querySelectorAll<HTMLElement>(".collapse-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const railId = btn.getAttribute("data-rail");
      if (!railId) return;
      const rail = document.getElementById(railId);
      if (!rail) return;
      const side = railId.replace("rail-", "") as "left" | "right";
      setRailCollapsed(side, !rail.classList.contains("is-collapsed"));
      // Sync the global nav buttons to reflect actual state
      syncNavButtons();
    });
  });

  // Radius buttons
  document.querySelectorAll<HTMLElement>(".radius-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = Number(btn.getAttribute("data-radius"));
      if (!Number.isFinite(v)) return;
      const root = document.documentElement;
      root.style.setProperty("--r-canvas", `${v}px`);
      root.style.setProperty("--r-panel", `${Math.max(6, Math.round(v * 0.7))}px`);
      document.querySelectorAll<HTMLElement>(".radius-btn").forEach((b) => {
        b.setAttribute("aria-pressed", String(b === btn));
      });
    });
  });

  // Expanded / Navbar mode buttons
  document.querySelectorAll<HTMLElement>(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const collapseAll = btn.getAttribute("data-nav") === "collapsed";
      setRailCollapsed("left", collapseAll);
      setRailCollapsed("right", collapseAll);
      document.querySelectorAll<HTMLElement>(".nav-btn").forEach((b) => {
        b.setAttribute("aria-pressed", String(b === btn));
      });
    });
  });
}

function syncNavButtons(): void {
  const left = $("rail-left");
  const right = $("rail-right");
  const allCollapsed = !!left?.classList.contains("is-collapsed") && !!right?.classList.contains("is-collapsed");
  document.querySelectorAll<HTMLElement>(".nav-btn").forEach((b) => {
    const nav = b.getAttribute("data-nav");
    if (nav === "collapsed") b.setAttribute("aria-pressed", String(allCollapsed));
    if (nav === "expanded") b.setAttribute("aria-pressed", String(!allCollapsed));
  });
}

// ── Dimensions popover ──────────────────────────────────────────────────────

let dimsMenu: HTMLElement | null = null;

function toggleDimsMenu(): void {
  if (dimsMenu) {
    closeDimsMenu();
    return;
  }
  const btn = $("btn-dims");
  if (!btn) return;

  const menu = document.createElement("div");
  menu.className = "dims-menu";
  menu.setAttribute("role", "menu");

  const groups = [...new Set(DIMENSIONS.map((d) => d.group))];
  for (const g of groups) {
    const head = document.createElement("div");
    head.className = "dims-group";
    head.textContent = g;
    menu.appendChild(head);

    for (const d of DIMENSIONS.filter((x) => x.group === g)) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "dims-row";
      row.setAttribute("role", "menuitem");
      const active = editor?.active;
      const isCurrent = active?.width === d.width && active?.height === d.height;
      row.innerHTML =
        `<span class="dims-row-label">${d.label}</span>` +
        `<span class="dims-row-size">${d.width} × ${d.height}</span>` +
        (isCurrent ? `<span class="dims-row-check" aria-label="Current">✓</span>` : "");
      row.addEventListener("click", () => {
        editor?.setDimensions(d.width, d.height);
        closeDimsMenu();
        renderAll();
        zoomToFit();
      });
      menu.appendChild(row);
    }
  }

  // Anchor menu to the button
  const host = btn.closest(".panel-strip") || btn.parentElement;
  if (host) {
    (host as HTMLElement).style.position = (host as HTMLElement).style.position || "relative";
  }
  btn.insertAdjacentElement("afterend", menu);
  dimsMenu = menu;
  btn.setAttribute("aria-expanded", "true");

  const onDocClick = (e: MouseEvent) => {
    if (dimsMenu && !dimsMenu.contains(e.target as Node) && e.target !== btn && !btn.contains(e.target as Node)) {
      closeDimsMenu();
    }
  };
  setTimeout(() => document.addEventListener("click", onDocClick), 0);
  (menu as HTMLElement & { _off?: () => void })._off = () =>
    document.removeEventListener("click", onDocClick);
}

function closeDimsMenu(): void {
  if (!dimsMenu) return;
  (dimsMenu as HTMLElement & { _off?: () => void })._off?.();
  dimsMenu.remove();
  dimsMenu = null;
  $("btn-dims")?.setAttribute("aria-expanded", "false");
}

// ── Boot ────────────────────────────────────────────────────────────────────

function boot(): void {
  const canvas = $<HTMLCanvasElement>("gl-canvas");
  if (!canvas) {
    console.error("[layers-desktop] no #gl-canvas");
    return;
  }

  editor = new Editor(canvas, 1920, 1080);
  editor.uploadDefaultSource();
  editor.rebuildPasses();

  mountTopbar();
  mountShellControls();
  mountInsertBar();

  initPicker({
    add: (def: CoreDef) => {
      const item = editor?.addCore(def);
      if (item) editor?.selectItem(item.id);
      renderAll();
    },
    close: () => {
      $("insert-host")?.querySelector<HTMLElement>("button")?.focus();
    },
  });

  // On narrow viewports, default to navbar (collapsed) mode so the canvas
  // window remains usable while preserving the rail-behind-canvas geometry.
  if (window.innerWidth <= 900) {
    setRailCollapsed("left", true);
    setRailCollapsed("right", true);
    syncNavButtons();
  }

  renderAll();
  zoomToFit();
  requestAnimationFrame(loop);

  // `?selfcheck=1` publishes measured geometry to the DOM so a test harness can
  // assert on it without evaluating JS in the page (see src/selfcheck.ts).
  if (new URLSearchParams(location.search).has("selfcheck")) {
    void import("./selfcheck.js").then((m) => {
      (window as unknown as { __publishSelfCheck?: () => unknown }).__publishSelfCheck = m.publishSelfCheck;
      setTimeout(() => m.publishSelfCheck(), 800);
    });
  }

  // Keyboard: a desktop editor without shortcuts feels broken.
  document.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openPicker();
      return;
    }
    if (e.key === "Escape" && isOpen()) {
      closePicker();
      return;
    }
    if (mod && (e.key === "=" || e.key === "+")) {
      e.preventDefault();
      applyZoom(zoom * 1.25);
    }
    if (mod && e.key === "-") {
      e.preventDefault();
      applyZoom(zoom / 1.25);
    }
    if (mod && e.key === "0") {
      e.preventDefault();
      zoomToFit();
    }
  });

  window.addEventListener("resize", () => {
    // Keep the frame fitted as the window changes.
    if (zoom <= 1) zoomToFit();
  });

  console.info("[layers-desktop] ready —", CORE_DEFS.length, "cores");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
