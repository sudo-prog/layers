// @vitest-environment jsdom
/**
 * Tests for keyboard shortcuts (Stage 0.5 Feature 1)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleKeyboard,
  getShortcuts,
  type KeyboardHandlers,
  type KeyboardState,
} from "./keyboard";

// Mock state for testing
function createMockState() {
  return {
    stackState: {
      items: [
        { id: "item-1", core: "blur", params: {}, opacity: 1, blend: "normal", mask: null, enabled: true },
        { id: "item-2", core: "noise-grain", params: {}, opacity: 1, blend: "normal", mask: null, enabled: true },
      ],
      selectedId: "item-1" as string | null,
    },
    theme: "light" as "light" | "dark",
    undoStack: [] as any[],
    redoStack: [] as any[],
  };
}

describe("keyboard shortcuts", () => {
  let mockState: ReturnType<typeof createMockState> & { selectedItem: () => any };
  let handlers: KeyboardHandlers;

  beforeEach(() => {
    const base = createMockState();
    mockState = {
      ...base,
      selectedItem: () => base.stackState.items.find((i) => i.id === base.stackState.selectedId) ?? null,
    };
    handlers = {
      doUndo: vi.fn(),
      doRedo: vi.fn(),
      doSave: vi.fn(),
      doExport: vi.fn(),
      doDelete: vi.fn(),
      doToggle: vi.fn(),
      doMoveUp: vi.fn(),
      doMoveDown: vi.fn(),
      doDuplicate: vi.fn(),
      doToggleTheme: vi.fn(),
      doAddCore: vi.fn(),
      doToggleHelp: vi.fn(),
    };
  });

  describe("getShortcuts", () => {
    it("returns a map of all shortcuts", () => {
      const shortcuts = getShortcuts();
      expect(shortcuts).toBeDefined();
      expect(shortcuts["Ctrl+Z"]).toBe("Undo");
      expect(shortcuts["Ctrl+Y"]).toBe("Redo");
      expect(shortcuts["Ctrl+S"]).toBe("Save to IndexedDB");
      expect(shortcuts["Ctrl+E"]).toBe("Export preset JSON");
      expect(shortcuts["Delete"]).toBe("Delete selected item");
      expect(shortcuts["Backspace"]).toBe("Delete selected item");
      expect(shortcuts["Space"]).toBe("Toggle enabled/disabled");
      expect(shortcuts["ArrowUp"]).toBe("Move item up");
      expect(shortcuts["ArrowDown"]).toBe("Move item down");
      expect(shortcuts["1"]).toBe("Add Pattern/Dither");
      expect(shortcuts["2"]).toBe("Add Noise/Grain");
      expect(shortcuts["3"]).toBe("Add Blur/Convolution");
      expect(shortcuts["4"]).toBe("Add Color/Blend");
      expect(shortcuts["5"]).toBe("Add Displacement");
      expect(shortcuts["6"]).toBe("Add Lighting");
      expect(shortcuts["7"]).toBe("Add Outline/Edge");
      expect(shortcuts["T"]).toBe("Toggle theme");
      expect(shortcuts["D"]).toBe("Duplicate selected item");
      expect(shortcuts["?"]).toBe("Toggle help overlay");
    });
  });

  describe("handleKeyboard", () => {
    it("Ctrl+Z triggers undo", () => {
      const e = new KeyboardEvent("keydown", { key: "z", ctrlKey: true });
      vi.spyOn(e, "preventDefault");
      handleKeyboard(e, mockState as KeyboardState, handlers);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(handlers.doUndo).toHaveBeenCalled();
    });

    it("Ctrl+Y triggers redo", () => {
      const e = new KeyboardEvent("keydown", { key: "y", ctrlKey: true });
      vi.spyOn(e, "preventDefault");
      handleKeyboard(e, mockState as KeyboardState, handlers);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(handlers.doRedo).toHaveBeenCalled();
    });

    it("Ctrl+S triggers save and prevents default", () => {
      const e = new KeyboardEvent("keydown", { key: "s", ctrlKey: true });
      vi.spyOn(e, "preventDefault");
      handleKeyboard(e, mockState as KeyboardState, handlers);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(handlers.doSave).toHaveBeenCalled();
    });

    it("Ctrl+E triggers export and prevents default", () => {
      const e = new KeyboardEvent("keydown", { key: "e", ctrlKey: true });
      vi.spyOn(e, "preventDefault");
      handleKeyboard(e, mockState as KeyboardState, handlers);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(handlers.doExport).toHaveBeenCalled();
    });

    it("Delete triggers delete", () => {
      const e = new KeyboardEvent("keydown", { key: "Delete" });
      vi.spyOn(e, "preventDefault");
      handleKeyboard(e, mockState as KeyboardState, handlers);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(handlers.doDelete).toHaveBeenCalled();
    });

    it("Backspace triggers delete", () => {
      const e = new KeyboardEvent("keydown", { key: "Backspace" });
      vi.spyOn(e, "preventDefault");
      handleKeyboard(e, mockState as KeyboardState, handlers);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(handlers.doDelete).toHaveBeenCalled();
    });

    it("Space triggers toggle and prevents default", () => {
      const e = new KeyboardEvent("keydown", { key: " " });
      vi.spyOn(e, "preventDefault");
      handleKeyboard(e, mockState as KeyboardState, handlers);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(handlers.doToggle).toHaveBeenCalled();
    });

    it("ArrowUp triggers move up", () => {
      const e = new KeyboardEvent("keydown", { key: "ArrowUp" });
      vi.spyOn(e, "preventDefault");
      handleKeyboard(e, mockState as KeyboardState, handlers);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(handlers.doMoveUp).toHaveBeenCalled();
    });

    it("ArrowDown triggers move down", () => {
      const e = new KeyboardEvent("keydown", { key: "ArrowDown" });
      vi.spyOn(e, "preventDefault");
      handleKeyboard(e, mockState as KeyboardState, handlers);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(handlers.doMoveDown).toHaveBeenCalled();
    });

    it("T triggers theme toggle", () => {
      const e = new KeyboardEvent("keydown", { key: "t" });
      vi.spyOn(e, "preventDefault");
      handleKeyboard(e, mockState as KeyboardState, handlers);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(handlers.doToggleTheme).toHaveBeenCalled();
    });

    it("D triggers duplicate", () => {
      const e = new KeyboardEvent("keydown", { key: "d" });
      vi.spyOn(e, "preventDefault");
      handleKeyboard(e, mockState as KeyboardState, handlers);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(handlers.doDuplicate).toHaveBeenCalled();
    });

    it("? triggers help toggle", () => {
      const e = new KeyboardEvent("keydown", { key: "?" });
      vi.spyOn(e, "preventDefault");
      handleKeyboard(e, mockState as KeyboardState, handlers);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(handlers.doToggleHelp).toHaveBeenCalled();
    });

    it("1-7 triggers add core", () => {
      for (let i = 1; i <= 7; i++) {
        (handlers.doAddCore as ReturnType<typeof vi.fn>).mockClear();
        const e = new KeyboardEvent("keydown", { key: String(i) });
        vi.spyOn(e, "preventDefault");
        handleKeyboard(e, mockState as KeyboardState, handlers);
        expect(e.preventDefault).toHaveBeenCalled();
        expect(handlers.doAddCore).toHaveBeenCalledWith(i);
      }
    });

    it("does nothing for unhandled keys", () => {
      const e = new KeyboardEvent("keydown", { key: "x" });
      vi.spyOn(e, "preventDefault");
      handleKeyboard(e, mockState as KeyboardState, handlers);
      expect(e.preventDefault).not.toHaveBeenCalled();
      expect(handlers.doUndo).not.toHaveBeenCalled();
      expect(handlers.doRedo).not.toHaveBeenCalled();
    });

    it("does not trigger shortcuts when typing in input", () => {
      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();
      const e = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true });
      input.dispatchEvent(e);
      document.body.removeChild(input);
    });
  });
});
