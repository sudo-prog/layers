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
  theme: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  canvas:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15.5 8 10l4 4 3.5-3.5L21 16"/>',
  cores: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  stack: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
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
