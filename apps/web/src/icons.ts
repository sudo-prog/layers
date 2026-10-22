/**
 * Inline SVG icon set — 24×24, stroke-based, inherits `currentColor`.
 *
 * Emoji are deliberately avoided: they render inconsistently across platforms
 * and cannot inherit colour or stroke weight from the surrounding control.
 */

const PATHS: Record<string, string> = {
  undo: '<path d="M7 5 3 9l4 4"/><path d="M3 9h11a6 6 0 0 1 0 12h-4"/>',
  redo: '<path d="M17 5l4 4-4 4"/><path d="M21 9H10a6 6 0 0 0 0 12h4"/>',
  export:
    '<path d="M12 15V3"/><path d="M8 7l4-4 4 4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  import:
    '<path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  vector:
    '<path d="M4 20C10 20 12 4 20 4"/><circle cx="4" cy="20" r="2"/><circle cx="20" cy="4" r="2"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8V3"/><path d="M8 21v-6h8v6"/>',
  clear: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 14h10l1-14"/>',
  review:
    '<path d="M9 3h6v3H9z"/><path d="M15 4h3v17H6V4h3"/><path d="M9 13l2 2 4-4"/>',
  compare:
    '<path d="M12 3v18"/><path d="M5 7h14"/><path d="M5 7 2 13a3 3 0 0 0 6 0z"/><path d="M19 7l-3 6a3 3 0 0 0 6 0z"/>',
  presets:
    '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z"/>',
  library:
    '<path d="M4 4h4v16H4z"/><path d="M10 4h4v16h-4z"/><path d="M16.5 5.2 20 6.4l-4 14.4-3.5-1.2z"/>',
  photo:
    '<rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8.5 6 10 3.5h4L15.5 6"/>',
  learning:
    '<path d="M5 20v-6"/><path d="M12 20V4"/><path d="M19 20v-9"/><path d="M3 20h18"/>',
  ai: '<path d="M11 4l1.6 4.4L17 10l-4.4 1.6L11 16l-1.6-4.4L5 10l4.4-1.6z"/><path d="M18 15l.9 2.1 2.1.9-2.1.9L18 21l-.9-2.1-2.1-.9 2.1-.9z"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  canvas:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15.5 8 10l4 4 3.5-3.5L21 16"/>',
  cores: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  stack: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  // ── Inspector / properties panel ────────────────────────────────────────
  chevron: '<path d="M6 9l6 6 6-6"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  reset:
    '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff:
    '<path d="M3 3l18 18"/><path d="M10.6 10.6a3 3 0 0 0 4.2 4.2"/><path d="M9.4 5.3A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.9 3.9"/><path d="M6.6 6.6A16.6 16.6 0 0 0 2 12s3.6 7 10 7a10.6 10.6 0 0 0 4.1-.9"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  unlock:
    '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/>',
  shuffle:
    '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>',
  swap: '<path d="M7 4v13"/><path d="M4 14l3 3 3-3"/><path d="M17 20V7"/><path d="M14 10l3-3 3 3"/>',
  close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
  frame:
    '<path d="M4 8V6a2 2 0 0 1 2-2h2"/><path d="M16 4h2a2 2 0 0 1 2 2v2"/><path d="M20 16v2a2 2 0 0 1-2 2h-2"/><path d="M8 20H6a2 2 0 0 1-2-2v-2"/>',
  move: '<path d="M12 3v18"/><path d="M3 12h18"/><path d="M12 3l-2.5 2.5"/><path d="M12 3l2.5 2.5"/><path d="M12 21l-2.5-2.5"/><path d="M12 21l2.5-2.5"/>',
  rotate:
    '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',
  blend: '<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/>',
  mask: '<path d="M12 3l7 4v5c0 4.4-3 8-7 9-4-1-7-4.6-7-9V7z"/><path d="M9 12l2 2 4-4"/>',
  opacity: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none"/>',
  dynamic:
    '<path d="M4 18c4 0 4-12 8-12s4 12 8 12"/><path d="M4 18h16"/>',
  texture:
    '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 14l4-4 3 3 3-3 8 8"/>',
  text: '<path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M9 20h6"/>',
  shape: '<path d="M12 3l8 18H4z"/>',
  shapes:
    '<path d="M12 3l8 18H4z"/><circle cx="18" cy="18" r="3"/>',
  // Lighting: a sun — distinct from every other glyph in the set.
  light:
    '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5"/><path d="M12 19.5V22"/><path d="M2 12h2.5"/><path d="M19.5 12H22"/><path d="M4.9 4.9l1.8 1.8"/><path d="M17.3 17.3l1.8 1.8"/><path d="M19.1 4.9l-1.8 1.8"/><path d="M6.7 17.3l-1.8 1.8"/>',
  // Outline / edge: a rounded square with a doubled edge — reads as "edge",
  // and shares no geometry with the triangle, sun or blur glyphs.
  edge:
    '<rect x="4" y="4" width="16" height="16" rx="3"/><rect x="8.5" y="8.5" width="7" height="7" rx="1.5"/>',
  stylize:
    '<path d="M4 20l6-16 6 16"/><path d="M6.5 14h7"/>',
  distort:
    '<path d="M3 6c3 0 3 4 6 4s3-4 6-4 3 4 6 4"/><path d="M3 18c3 0 3-4 6-4s3 4 6 4 3-4 6-4 3 4 6 4"/>',
  blur:
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
  adjust:
    '<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/>',
  media: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M4 17l5-5 3 3 3.5-3.5L21 17"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 17.5l9 5 9-5"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6"/><path d="M9 16h6"/>',
  exportCode:
    '<path d="M8 9l-4 3 4 3"/><path d="M16 9l4 3-4 3"/><path d="M13 7l-2 10"/>',
  terminal:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3"/><path d="M13 15h4"/>',
  play: '<path d="M7 5l11 7-11 7z"/>',
  keyframe: '<path d="M12 4l3 5 5 .8-3.6 3.5.9 5.2L12 16l-5.3 2.5.9-5.2L4 9.8 9 9z"/>',
};

/** Returns the SVG markup for `name`, sized by CSS, coloured by `currentColor`. */
export function iconSvg(name: string): string {
  const body = PATHS[name] ?? "";
  return (
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ' +
    `aria-hidden="true" focusable="false">${body}</svg>`
  );
}
