import { createMaskBrush, type MaskBrush } from "./maskBrush";
import { createVectorEditor, type VectorEditor } from "./vectorEditor";

const $ = <T extends Element>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Element not found: ${sel}`);
  return el;
};

export const canvas = $<HTMLCanvasElement>("#gl-canvas");
export const coreList = $<HTMLDivElement>("#core-list");
export const stackList = $<HTMLDivElement>("#stack-list");
export const inspector = $<HTMLDivElement>("#inspector");
export const passCount = $<HTMLSpanElement>("#pass-count");
export const fpsDisplay = $<HTMLSpanElement>("#fps-display");
export const btnUndo = $<HTMLButtonElement>("#btn-undo");
export const btnRedo = $<HTMLButtonElement>("#btn-redo");
btnUndo.setAttribute("aria-label", "Undo");
btnRedo.setAttribute("aria-label", "Redo");
export const btnExport = $<HTMLButtonElement>("#btn-export");
export const btnImport = $<HTMLButtonElement>("#btn-import");
export const btnSave = $<HTMLButtonElement>("#btn-save");
export const btnClear = $<HTMLButtonElement>("#btn-clear");
export const btnTheme = $<HTMLButtonElement>("#btn-theme");
export const syncIndicator = $<HTMLSpanElement>(".sync-indicator");
export const syncText = $<HTMLSpanElement>("#sync-text");
export const maskCanvas = $<HTMLCanvasElement>("#mask-canvas");
export const maskOverlay = $<HTMLDivElement>("#mask-overlay");
export const insertHost = $<HTMLDivElement>("#insert-host");
export const vectorPanel = $<HTMLDivElement>("#vector-panel");
export const vectorSvg = $<SVGSVGElement>("#vector-svg");
export const btnVector = $<HTMLButtonElement>("#btn-vector");
export const brushSizeSlider = $<HTMLInputElement>("#brush-size");
export const brushOpacitySlider = $<HTMLInputElement>("#brush-opacity");
export const btnPaint = $<HTMLButtonElement>("#btn-paint");
export const btnErase = $<HTMLButtonElement>("#btn-erase");
export const btnClearMask = $<HTMLButtonElement>("#btn-clear-mask");
export const btnCloseMask = $<HTMLButtonElement>("#btn-close-mask");
export const btnCloseVector = $<HTMLButtonElement>("#btn-close-vector");
export const btnAddPoint = $<HTMLButtonElement>("#btn-add-point");
export const btnAddLine = $<HTMLButtonElement>("#btn-add-line");
export const btnAddCurve = $<HTMLButtonElement>("#btn-add-curve");
export const btnDeletePoint = $<HTMLButtonElement>("#btn-delete-point");
export const btnNewPath = $<HTMLButtonElement>("#btn-new-path");
export const btnZoomIn = $<HTMLButtonElement>("#btn-zoom-in");
export const btnZoomOut = $<HTMLButtonElement>("#btn-zoom-out");
export const btnExportSvg = $<HTMLButtonElement>("#btn-export-svg");
export const btnImportSvg = $<HTMLButtonElement>("#btn-import-svg");
export const btnCloseHelp = $<HTMLButtonElement>("#btn-close-help");
export const helpOverlay = $<HTMLDivElement>("#help-overlay");
export const helpContent = $<HTMLDivElement>("#help-content");

// Set ARIA labels for icon-only buttons
btnCloseMask.setAttribute("aria-label", "Close mask");
btnCloseVector.setAttribute("aria-label", "Close vector editor");
btnCloseHelp.setAttribute("aria-label", "Close help");

// Derived instances created from DOM elements
export const maskBrush: MaskBrush = createMaskBrush(maskCanvas);
export const vectorEditor: VectorEditor = createVectorEditor(vectorSvg);
