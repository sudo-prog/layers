/**
 * Inline SVG icons, single stroke family, `currentColor`.
 *
 * Never emoji: emoji render inconsistently across platforms and cannot inherit
 * colour or stroke weight. Each returns a 16x16 viewBox string.
 */

const wrap = (body: string, size = 16): string =>
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
  `stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ` +
  `aria-hidden="true" focusable="false">${body}</svg>`;

const ICONS: Record<string, string> = {
  textures: `<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9" stroke-dasharray="2 3"/>`,
  adjustments: `<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/>`,
  blurs: `<circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="9" opacity="0.5"/>`,
  distortions: `<path d="M3 9c3 0 3 6 6 6s3-6 6-6 3 6 6 6"/><path d="M3 15c3 0 3-6 6-6"/>`,
  light: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>`,
  edges: `<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1"/>`,
  layers: `<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 14 9 5 9-5"/>`,
  eye: `<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.5"/>`,
  eyeOff: `<path d="M4 4l16 16"/><path d="M9.9 5.2A9.6 9.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.6 3.4"/><path d="M6.2 7.6A16.6 16.6 0 0 0 2 12s3.5 7 10 7a9.9 9.9 0 0 0 4-.8"/>`,
  trash: `<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  close: `<path d="M6 6l12 12M18 6L6 18"/>`,
  chevronDown: `<path d="m6 9 6 6 6-6"/>`,
  chevronUp: `<path d="m6 15 6-6 6 6"/>`,
  zoomIn: `<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M11 8v6M8 11h6"/>`,
  zoomOut: `<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M8 11h6"/>`,
  sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>`,
  moon: `<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>`,
  frame: `<path d="M4 8h16M4 16h16M8 4v16M16 4v16"/>`,
  search: `<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>`,
};

export function iconSvg(name: string, size = 16): string {
  return wrap(ICONS[name] ?? ICONS.layers, size);
}

export const ICON_NAMES = Object.keys(ICONS);
