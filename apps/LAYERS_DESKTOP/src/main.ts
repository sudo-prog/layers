/**
 * LAYERS Desktop — entry point.
 *
 * The full-canvas shader editor: a shader tree, a layer stack, a full-bleed
 * canvas the panels glass over, and a props panel. Multiple shaders coexist as
 * frames, which is the desktop surface's whole reason for existing next to the
 * mobile prototype.
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
  if (frame) {
    // Size the frame from the DOCUMENT, then scale it. Relying on the canvas's
    // `width: 100%` alone is circular — the frame has no intrinsic size, so it
    // collapsed and the render sat off-centre and clipped.
    const doc = editor?.active;
    if (doc) {
      frame.style.setProperty("--frame-w", `${doc.width}px`);
      frame.style.setProperty("--frame-h", `${doc.height}px`);
    }
    frame.style.transform = `scale(${zoom})`;
  }
  const readout = $("zoom-level");
  if (readout) readout.textContent = `${Math.round(zoom * 100)}%`;
}

/** Fit the active frame inside the visible canvas (between the panels). */
function zoomToFit(): void {
  const doc = editor?.active;
  const area = $("canvas-area");
  if (!doc || !area) return;

  // The canvas area is FULL-BLEED, so `clientWidth` includes both panels. The
  // VISIBLE strip is `clientWidth - panel-left - panel-right`. Fitting against
  // clientWidth alone would size the frame for space that is behind a panel.
  const cs = getComputedStyle(document.documentElement);
  const left = parseFloat(cs.getPropertyValue("--panel-left-w")) || 264;
  const right = parseFloat(cs.getPropertyValue("--panel-right-w")) || 316;
  const visibleW = area.clientWidth - left - right;

  // Vertically the stage already excludes the top bar (it is a flex sibling), so
  // only the toolbar and breathing room need subtracting — not the whole chrome.
  const visibleH = area.clientHeight - 88;
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
    const el = $("fps-display");
    if (el) el.textContent = `${fps} fps`;
    frameCount = 0;
    lastFps = now;
  }

  const pc = $("pass-count");
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
  const host = $("layer-list");
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
    eye.className = "icon-btn";
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
  const host = $("inspector");
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
  const dl = $("dims-label");
  if (dl && doc) dl.textContent = `${doc.width} × ${doc.height}`;
}

// ── Toolbar ─────────────────────────────────────────────────────────────────

function mountInsertBar(): void {
  const host = $("insert-host");
  if (!host) return;
  const bar = document.createElement("div");
  bar.className = "insert-bar";
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
      `<span class="insert-btn-label">${cat.label}</span>` +
      // Kept in the accessibility tree at every width so the control stays
      // nameable by text; the visible label is hidden below 1180px.
      `<span class="sr-only insert-btn-name">${cat.label}</span>`;
    b.addEventListener("click", () => openPicker(cat.id as CategoryId));
    bar.appendChild(b);
  }

  host.innerHTML = "";
  host.appendChild(bar);
}

function mountTopbar(): void {
  $("btn-zoom-in")?.addEventListener("click", () => applyZoom(zoom * 1.25));
  $("btn-zoom-out")?.addEventListener("click", () => applyZoom(zoom / 1.25));
  $("btn-zoom-fit")?.addEventListener("click", zoomToFit);

  const theme = $("btn-theme");
  theme?.addEventListener("click", () => {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    theme.innerHTML = iconSvg(next === "dark" ? "moon" : "sun");
    theme.setAttribute("aria-label", next === "dark" ? "Switch to light theme" : "Switch to dark theme");
  });
  if (theme) {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    theme.innerHTML = iconSvg(dark ? "moon" : "sun");
  }

  const proj = $("btn-project");
  proj?.addEventListener("click", () => {
    if (!editor) return;
    const next = prompt("Project name", editor.project.name);
    if (next && next.trim()) {
      editor.project.name = next.trim();
      proj.textContent = next.trim();
    }
  });

  // Dimensions switcher: a real popover, grouped by device class.
  $("btn-dims")?.addEventListener("click", () => toggleDimsMenu());
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

  btn.parentElement?.appendChild(menu);
  dimsMenu = menu;
  btn.setAttribute("aria-expanded", "true");

  const onDocClick = (e: MouseEvent) => {
    if (dimsMenu && !dimsMenu.contains(e.target as Node) && e.target !== btn) {
      closeDimsMenu();
    }
  };
  setTimeout(() => document.addEventListener("click", onDocClick), 0);
  menu.dataset.bound = "1";
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
  mountInsertBar();

  initPicker({
    add: (def: CoreDef) => {
      const item = editor?.addCore(def);
      if (item) editor?.selectItem(item.id);
      renderAll();
    },
    close: () => {
      // Re-focus the toolbar so keyboard users are not dropped into the void.
      $("insert-host")?.querySelector<HTMLElement>("button")?.focus();
    },
  });

  renderAll();
  zoomToFit();
  requestAnimationFrame(loop);

  // `?selfcheck=1` publishes measured geometry to the DOM so a test harness can
  // assert on it without evaluating JS in the page (see src/selfcheck.ts).
  if (new URLSearchParams(location.search).has("selfcheck")) {
    void import("./selfcheck.js").then((m) => {
      // Exposed so a harness can re-publish AFTER it has added a layer — the
      // boot-time publish runs before any layer exists.
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
