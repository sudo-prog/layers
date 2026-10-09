/**
 * Keyboard shortcuts for LAYERS web app (Stage 0.5 Feature 1)
 *
 * Exports a handleKeyboard function and a shortcuts map for the help overlay.
 */

import type { StackState } from "@layers/stack";

export interface KeyboardHandlers {
  doUndo: () => void;
  doRedo: () => void;
  doSave: () => void;
  doExport: () => void;
  doDelete: () => void;
  doToggle: () => void;
  doMoveUp: () => void;
  doMoveDown: () => void;
  doDuplicate: () => void;
  doToggleTheme: () => void;
  doAddCore: (index: number) => void;
  doToggleHelp: () => void;
}

export interface KeyboardState {
  stackState: StackState;
  theme: "light" | "dark";
  undoStack: StackState[];
  redoStack: StackState[];
}

/**
 * All keyboard shortcuts displayed in the help overlay.
 */
export function getShortcuts(): Record<string, string> {
  return {
    "Ctrl+Z": "Undo",
    "Ctrl+Y": "Redo",
    "Ctrl+S": "Save to IndexedDB",
    "Ctrl+E": "Export preset JSON",
    "Delete": "Delete selected item",
    "Backspace": "Delete selected item",
    "Space": "Toggle enabled/disabled",
    "ArrowUp": "Move item up",
    "ArrowDown": "Move item down",
    "1": "Add Pattern/Dither",
    "2": "Add Noise/Grain",
    "3": "Add Blur/Convolution",
    "4": "Add Color/Blend",
    "5": "Add Displacement",
    "6": "Add Lighting",
    "7": "Add Outline/Edge",
    "T": "Toggle theme",
    "D": "Duplicate selected item",
    "?": "Toggle help overlay",
  };
}

/**
 * Core names for number key shortcuts (1-7).
 */
export const CORE_KEYS: Record<string, string> = {
  "1": "pattern-dither",
  "2": "noise-grain",
  "3": "blur",
  "4": "color-blend",
  "5": "displacement",
  "6": "lighting",
  "7": "outline",
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable
  );
}

/**
 * Global keyboard shortcut handler.
 * Should be attached to document keydown events.
 */
export function handleKeyboard(
  e: KeyboardEvent,
  state: KeyboardState,
  handlers: KeyboardHandlers
): void {
  // Don't intercept when typing in form fields
  if (isEditableTarget(e.target)) return;

  const key = e.key;

  // Ctrl/Cmd shortcuts
  if (e.ctrlKey || e.metaKey) {
    switch (key.toLowerCase()) {
      case "z":
        e.preventDefault();
        handlers.doUndo();
        return;
      case "y":
        e.preventDefault();
        handlers.doRedo();
        return;
      case "s":
        e.preventDefault();
        handlers.doSave();
        return;
      case "e":
        e.preventDefault();
        handlers.doExport();
        return;
    }
    return; // Other Ctrl combos pass through
  }

  // Single-key shortcuts
  switch (key) {
    case "Delete":
    case "Backspace":
      e.preventDefault();
      handlers.doDelete();
      return;
    case " ":
      e.preventDefault();
      handlers.doToggle();
      return;
    case "ArrowUp":
      e.preventDefault();
      handlers.doMoveUp();
      return;
    case "ArrowDown":
      e.preventDefault();
      handlers.doMoveDown();
      return;
    case "t":
    case "T":
      e.preventDefault();
      handlers.doToggleTheme();
      return;
    case "d":
    case "D":
      e.preventDefault();
      handlers.doDuplicate();
      return;
    case "?":
      e.preventDefault();
      handlers.doToggleHelp();
      return;
  }

  // Number keys 1-7 for adding cores
  if (key >= "1" && key <= "7") {
    e.preventDefault();
    handlers.doAddCore(parseInt(key, 10));
    return;
  }
}
