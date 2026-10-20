import {
  removeStackItem,
  updateStackItem,
  toggleStackItem,
  moveStackItem,
  addStackItem,
  createStackState,
} from "@layers/stack";
import {
  getShortcuts,
  handleKeyboard,
  CORE_KEYS,
  type KeyboardHandlers,
} from "./keyboard";
import { mountReviewScreen } from "./reviewScreen";
import { mountComparisonTools } from "./comparisonTools";
import { mountPresetGrid } from "./presetGrid";
import { mountLibraryPanel } from "./libraryPanel";
import { mountLearningPanel } from "./learningPanel";
import { mountAIPanel } from "./aiPanel";
import { openCamera, loadImageAsSource } from "./imageImport";
import { presetIdFromHash } from "./presetShare";
import { presetStore } from "./presetStore";
import { emitEvent } from "./eventEmitter";
import { persistence } from "./persistence";
import { state } from "./app-state";
import {
  canvas,
  maskCanvas,
  maskOverlay,
  maskBrush,
  vectorEditor,
  vectorPanel,
  vectorSvg,
  btnVector,
  brushSizeSlider,
  brushOpacitySlider,
  btnPaint,
  btnErase,
  btnClearMask,
  btnCloseMask,
  btnCloseVector,
  btnAddPoint,
  btnAddLine,
  btnAddCurve,
  btnDeletePoint,
  btnNewPath,
  btnZoomIn,
  btnZoomOut,
  btnExportSvg,
  btnImportSvg,
  helpOverlay,
  helpContent,
  btnCloseHelp,
  btnUndo,
  btnRedo,
  btnExport,
  btnImport,
  btnSave,
  btnClear,
  btnTheme,
  syncIndicator,
  syncText,
} from "./dom-refs";
import {
  pushUndo,
  doUndo,
  doRedo,
  toggleTheme,
  exportPreset,
  importPreset,
  scheduleSave,
  rebuildStack,
  rebuildInspector,
  rebuildPasses,
  saveMaskToSelected,
  updateUndoButtons,
  CORE_DEFS,
  updateSyncStatus,
  openPresetPanel,
  openLibraryPanel,
  importPhotoFromCamera,
} from "./main";
import { createToolbarButton, initToolbarOverflow } from "./toolbar";

export function initMaskBrush(): void {
  // Sync mask canvas size with GL canvas
  maskCanvas.width = canvas.width;
  maskCanvas.height = canvas.height;

  // Brush size slider
  brushSizeSlider.addEventListener("input", () => {
    maskBrush.setSize(parseInt(brushSizeSlider.value, 10));
  });

  // Brush opacity slider
  brushOpacitySlider.addEventListener("input", () => {
    maskBrush.setOpacity(parseFloat(brushOpacitySlider.value));
  });

  // Paint/Erase mode buttons
  btnPaint.addEventListener("click", () => {
    maskBrush.setMode("paint");
    btnPaint.classList.add("active");
    btnErase.classList.remove("active");
  });
  btnErase.addEventListener("click", () => {
    maskBrush.setMode("erase");
    btnErase.classList.add("active");
    btnPaint.classList.remove("active");
  });

  // Clear mask
  btnClearMask.addEventListener("click", () => {
    maskBrush.clear();
    saveMaskToSelected();
  });

  // Close mask overlay
  btnCloseMask.addEventListener("click", () => {
    maskOverlay.classList.remove("visible");
    maskOverlay.classList.add("hidden");
    maskCanvas.classList.add("hidden");
    saveMaskToSelected();
  });

  // Paint events on mask canvas
  maskCanvas.addEventListener("mousedown", (e) => {
    state.isPainting = true;
    const rect = maskCanvas.getBoundingClientRect();
    state.lastPaintX = e.clientX - rect.left;
    state.lastPaintY = e.clientY - rect.top;
    maskBrush.paint(state.lastPaintX, state.lastPaintY);
  });
  maskCanvas.addEventListener("mousemove", (e) => {
    if (!state.isPainting) return;
    const rect = maskCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // Interpolate between last and current position for smooth strokes
    const dx = x - state.lastPaintX;
    const dy = y - state.lastPaintY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.floor(dist / (maskBrush.getSize() / 4)));
    for (let i = 1; i <= steps; i++) {
      const ix = state.lastPaintX + (dx * i) / steps;
      const iy = state.lastPaintY + (dy * i) / steps;
      maskBrush.paint(ix, iy);
    }
    state.lastPaintX = x;
    state.lastPaintY = y;
  });
  maskCanvas.addEventListener("mouseup", () => {
    state.isPainting = false;
    saveMaskToSelected();
  });
  maskCanvas.addEventListener("mouseleave", () => {
    state.isPainting = false;
    saveMaskToSelected();
  });
}

export function initVectorEditor(): void {
  // Close button
  btnCloseVector.addEventListener("click", () => {
    vectorPanel.classList.remove("visible");
    vectorPanel.classList.add("hidden");
  });

  // Add point mode
  let addPointMode = false;
  btnAddPoint.addEventListener("click", () => {
    addPointMode = !addPointMode;
    btnAddPoint.classList.toggle("active", addPointMode);
    vectorSvg.style.cursor = addPointMode ? "crosshair" : "default";
  });

  // Click on SVG to add point
  vectorSvg.addEventListener("click", (e) => {
    if (!addPointMode) return;
    const rect = vectorSvg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    vectorEditor.addPoint(x, y);
    vectorEditor.render();
  });

  // Add line
  btnAddLine.addEventListener("click", () => {
    const paths = vectorEditor.getPaths();
    if (paths.length > 0 && paths[paths.length - 1].points.length >= 2) {
      const pts = paths[paths.length - 1].points;
      vectorEditor.addLine(pts.length - 2, pts.length - 1);
      vectorEditor.render();
    }
  });

  // Add curve
  btnAddCurve.addEventListener("click", () => {
    const paths = vectorEditor.getPaths();
    if (paths.length > 0 && paths[paths.length - 1].points.length >= 2) {
      const pts = paths[paths.length - 1].points;
      const last = pts[pts.length - 1];
      const prev = pts[pts.length - 2];
      const cpx = (prev.x + last.x) / 2;
      const cpy = Math.min(prev.y, last.y) - 50;
      vectorEditor.addCurve(pts.length - 2, pts.length - 1, cpx, cpy);
      vectorEditor.render();
    }
  });

  // Delete last point
  btnDeletePoint.addEventListener("click", () => {
    const paths = vectorEditor.getPaths();
    if (paths.length > 0 && paths[paths.length - 1].points.length > 0) {
      const pts = paths[paths.length - 1].points;
      vectorEditor.deletePoint(paths.length - 1, pts.length - 1);
      vectorEditor.render();
    }
  });

  // New path
  btnNewPath.addEventListener("click", () => {
    vectorEditor.newPath();
    vectorEditor.render();
  });

  // Zoom
  btnZoomIn.addEventListener("click", () => {
    vectorEditor.zoomIn();
    vectorEditor.render();
  });
  btnZoomOut.addEventListener("click", () => {
    vectorEditor.zoomOut();
    vectorEditor.render();
  });

  // Export SVG
  btnExportSvg.addEventListener("click", () => {
    const svgString = vectorEditor.exportSVG();
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vector-path.svg";
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import SVG
  btnImportSvg.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".svg";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      vectorEditor.importSVG(text);
      vectorEditor.render();
    });
    input.click();
  });

  // Vector button in toolbar
  btnVector.addEventListener("click", () => {
    vectorPanel.classList.remove("hidden");
    vectorPanel.classList.add("visible");
    vectorEditor.render();
  });
}

export function initHelpOverlay(): void {
  const shortcuts = getShortcuts();
  let html = "<h3>Keyboard Shortcuts</h3><table>";
  for (const [key, desc] of Object.entries(shortcuts)) {
    html += `<tr><td class="shortcut-key">${key}</td><td>${desc}</td></tr>`;
  }
  html += "</table>";
  helpContent.innerHTML = html;

  btnCloseHelp.addEventListener("click", () => {
    helpOverlay.classList.remove("visible");
  });

  helpOverlay.addEventListener("click", (e) => {
    if (e.target === helpOverlay) {
      helpOverlay.classList.remove("visible");
    }
  });
}

export function initStage06(): void {
  const toolbarActions = document.querySelector(".toolbar-actions");
  if (!toolbarActions) return;

  // Secondary actions are inserted before the "More" trigger, keeping the order:
  // Undo Redo · Export … AI · More · Theme-switch.
  const anchor = document.getElementById("btn-more");

  const insert = (btn: HTMLElement) => {
    if (anchor && anchor.parentNode === toolbarActions) {
      toolbarActions.insertBefore(btn, anchor);
    } else {
      toolbarActions.appendChild(btn);
    }
  };

  // ── Review ─────────────────────────────────────────────────────────────
  const btnReview = createToolbarButton({
    id: "btn-review",
    icon: "review",
    label: "Review",
    title: "Review source vs reconstruction",
    secondary: true,
  });
  btnReview.addEventListener("click", () => {
    const existing = document.getElementById("review-overlay");
    if (existing) {
      existing.remove();
      return;
    }
    const mount = document.createElement("div");
    mount.id = "review-overlay-mount";
    document.body.appendChild(mount);
    mountReviewScreen(mount, {
      getCurrentStack: () => state.stack,
      getRenderer: () => state.renderer,
      getSourceCanvas: () => state.sourceCanvas,
      getCanvas: () => canvas,
      onAction: (action) => {
        if (action === "close") {
          document.getElementById("review-overlay")?.remove();
        }
      },
    });
  });
  insert(btnReview);

  // ── Compare ────────────────────────────────────────────────────────────
  const btnCompare = createToolbarButton({
    id: "btn-compare",
    icon: "compare",
    label: "Compare",
    title: "Compare source vs reconstruction",
    secondary: true,
  });
  btnCompare.addEventListener("click", () => {
    const existing = document.getElementById("compare-overlay");
    if (existing) {
      existing.remove();
      return;
    }
    const mount = document.createElement("div");
    mount.id = "compare-overlay-mount";
    document.body.appendChild(mount);
    mountComparisonTools(mount, {
      getCurrentStack: () => state.stack,
      getRenderer: () => state.renderer,
      getSourceCanvas: () => state.sourceCanvas,
      getCanvas: () => canvas,
      onIsolate: (itemId) => {
        // Temporarily render only the given item (or restore the full stack
        // when null). The pre-isolation stack is kept in a module-level slot so
        // the restore is not clobbered by a re-capture of the isolated state.
        if (itemId === null) {
          if (state.preIsolateStack) {
            state.stack = state.preIsolateStack;
            state.preIsolateStack = null;
          }
        } else {
          if (!state.preIsolateStack) state.preIsolateStack = state.stack;
          state.stack = {
            ...state.preIsolateStack,
            items: state.preIsolateStack.items.map((it) => ({
              ...it,
              enabled: it.id === itemId,
            })),
          };
        }
        rebuildPasses();
      },
      onAction: (action) => {
        if (action === "close") {
          document.getElementById("compare-overlay")?.remove();
        }
      },
    });
  });
  insert(btnCompare);

  // ── Presets ────────────────────────────────────────────────────────────
  const btnPresets = createToolbarButton({
    icon: "presets",
    label: "Presets",
    title: "Browse and apply saved presets",
    secondary: true,
  });
  btnPresets.addEventListener("click", () => {
    const existing = document.getElementById("preset-panel");
    if (existing) {
      existing.remove();
      return;
    }
    openPresetPanel();
  });
  insert(btnPresets);

  // ── Library (Stage 2.2) ────────────────────────────────────────────────
  const btnLibrary = createToolbarButton({
    icon: "library",
    label: "Library",
    title: "Search, share and manage presets",
    secondary: true,
  });
  btnLibrary.addEventListener("click", () => {
    const existing = document.getElementById("library-overlay-mount");
    if (existing) {
      existing.remove();
      return;
    }
    openLibraryPanel();
  });
  insert(btnLibrary);

  // ── Import Photo ───────────────────────────────────────────────────────
  const btnImportPhoto = createToolbarButton({
    icon: "photo",
    label: "Photo",
    title: "Import a photo from your camera or library",
    secondary: true,
  });
  btnImportPhoto.addEventListener("click", () => {
    void importPhotoFromCamera();
  });
  insert(btnImportPhoto);

  // ── Learning ───────────────────────────────────────────────────────────
  const btnLearn = createToolbarButton({
    id: "btn-learn",
    icon: "learning",
    label: "Learning",
    title: "Open learning panel",
    secondary: true,
  });
  btnLearn.addEventListener("click", () => {
    const existing = document.getElementById("learning-overlay");
    if (existing) {
      existing.remove();
      return;
    }
    const mount = document.createElement("div");
    mount.id = "learning-overlay-mount";
    document.body.appendChild(mount);
    mountLearningPanel(mount, {
      getFeatureVector: () => null,
    });
  });
  insert(btnLearn);

  // ── AI ─────────────────────────────────────────────────────────────────
  const btnAI = createToolbarButton({
    icon: "ai",
    label: "AI",
    title: "AI Assistant — extract features, search/optimize/prune stacks",
    secondary: true,
  });
  btnAI.addEventListener("click", () => {
    const existing = document.getElementById("ai-panel-mount");
    if (existing) {
      existing.remove();
      return;
    }
    const mount = document.createElement("div");
    mount.id = "ai-panel-mount";
    document.body.appendChild(mount);
    const handle = mountAIPanel(mount, {
      getCurrentStack: () => state.stack,
      applyStack: (items: any[]) => {
        pushUndo();
        state.stack = {
          items: items,
          selectedId: items[0]?.id ?? null,
        };
        rebuildStack();
        rebuildInspector();
        rebuildPasses();
        scheduleSave();
        emitEvent("stack_applied", {});
      },
    });
    void handle.refreshHealth();
  });
  insert(btnAI);

  // Now that every secondary button exists, place them for the current viewport.
  initToolbarOverflow();
}

export function wireToolbarButtons(): void {
  btnUndo.addEventListener("click", doUndo);
  btnRedo.addEventListener("click", doRedo);
  btnExport.addEventListener("click", exportPreset);
  btnImport.addEventListener("click", importPreset);
  btnSave.addEventListener("click", async () => {
    persistence.flush();
    const result = await persistence.save(state.stack);
    if (result.ok) {
      syncText.textContent = "Sync: saved";
      syncIndicator.className = "sync-indicator synced";
    } else {
      syncText.textContent = "Sync: save failed";
      syncIndicator.className = "sync-indicator error";
    }
    updateSyncStatus();
  });
  btnClear.addEventListener("click", async () => {
    if (!confirm("Clear all saved state from IndexedDB?")) return;
    persistence.flush();
    const result = await persistence.clear();
    if (result.ok) {
      state.stack = createStackState();
      state.undoStack = [];
      state.redoStack = [];
      updateUndoButtons();
      rebuildStack();
      rebuildInspector();
      rebuildPasses();
      syncText.textContent = "Sync: cleared";
      syncIndicator.className = "sync-indicator synced";
    } else {
      syncText.textContent = "Sync: clear failed";
      syncIndicator.className = "sync-indicator error";
    }
    updateSyncStatus();
  });
  btnTheme.addEventListener("click", toggleTheme);
}

function handleKeyboardShortcut(e: KeyboardEvent): void {
  const handlers: KeyboardHandlers = {
    doUndo,
    doRedo,
    doSave: () => btnSave.click(),
    doExport: exportPreset,
    doDelete: () => {
      const selected = state.stack.items.find(
        (i) => i.id === state.stack.selectedId,
      );
      if (selected) {
        pushUndo();
        state.stack = removeStackItem(state.stack, selected.id);
        rebuildStack();
        rebuildInspector();
        rebuildPasses();
        scheduleSave();
      }
    },
    doToggle: () => {
      const selected = state.stack.items.find(
        (i) => i.id === state.stack.selectedId,
      );
      if (selected) {
        pushUndo();
        state.stack = toggleStackItem(state.stack, selected.id);
        rebuildStack();
        rebuildPasses();
        scheduleSave();
      }
    },
    doMoveUp: () => {
      const selected = state.stack.items.find(
        (i) => i.id === state.stack.selectedId,
      );
      if (selected) {
        pushUndo();
        state.stack = moveStackItem(state.stack, selected.id, "up");
        rebuildStack();
        rebuildPasses();
        scheduleSave();
      }
    },
    doMoveDown: () => {
      const selected = state.stack.items.find(
        (i) => i.id === state.stack.selectedId,
      );
      if (selected) {
        pushUndo();
        state.stack = moveStackItem(state.stack, selected.id, "down");
        rebuildStack();
        rebuildPasses();
        scheduleSave();
      }
    },
    doDuplicate: () => {
      const selected = state.stack.items.find(
        (i) => i.id === state.stack.selectedId,
      );
      if (selected) {
        pushUndo();
        const newItem = {
          ...selected,
          id: `stack-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        };
        state.stack = addStackItem(state.stack, newItem);
        rebuildStack();
        rebuildInspector();
        rebuildPasses();
        scheduleSave();
      }
    },
    doToggleTheme: toggleTheme,
    doAddCore: (index: number) => {
      const coreName = CORE_KEYS[String(index)];
      if (!coreName) return;
      const def = CORE_DEFS.find((d) => d.name === coreName);
      if (!def) return;
      pushUndo();
      const core = def.create();
      const params: Record<string, unknown> = {};
      for (const p of def.params) {
        params[p.key] = p.default;
      }
      state.stack = addStackItem(state.stack, {
        core: def.name,
        params,
        opacity: 1,
        blend: "normal",
        mask: null,
        enabled: true,
      });
      rebuildStack();
      rebuildInspector();
      rebuildPasses();
      scheduleSave();
    },
    doToggleHelp: () => {
      helpOverlay.classList.toggle("visible");
    },
  };
  handleKeyboard(
    e,
    {
      stackState: state.stack,
      theme: state.theme,
      undoStack: state.undoStack,
      redoStack: state.redoStack,
    },
    handlers,
  );
}

export function wireKeyboardShortcuts(): void {
  document.addEventListener("keydown", handleKeyboardShortcut);
}

export function wireOverlayDismissal(): void {
  // ── Escape closes the topmost open overlay (WCAG 2.2 AA) ──
  // Ordered outermost-last so the most recently opened overlay closes first.
  const OVERLAY_SELECTORS = [
    "#help-overlay",
    ".review-overlay",
    ".compare-overlay",
    ".learning-overlay",
    "#library-overlay-mount",
    "#vector-panel",
  ];
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    for (const sel of OVERLAY_SELECTORS) {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>(sel));
      // Help/vector use a `hidden`/`visible` class; the mounted overlays are
      // removed from the DOM by their own close button.
      const open = nodes.filter((n) => {
        if (n.classList.contains("hidden")) return false;
        if (n.classList.contains("help-overlay"))
          return n.classList.contains("visible");
        return true;
      });
      const top = open[open.length - 1];
      if (top) {
        e.preventDefault();
        const close = Array.from(top.querySelectorAll("button")).find(
          (b) =>
            (b.getAttribute("aria-label") || "")
              .toLowerCase()
              .includes("close") || b.textContent?.trim() === "✕",
        );
        if (close) {
          (close as HTMLButtonElement).click();
        } else {
          top.remove();
        }
        return;
      }
    }
  });
}
